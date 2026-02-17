from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

TOKEN_PATTERN = re.compile(r"\b\w+\b")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


def cosine_similarity(vector_a: list[float], vector_b: list[float]) -> float:
    return sum(a * b for a, b in zip(vector_a, vector_b))


def normalize_token(token: str) -> str:
    token = token.lower()

    # Lightweight singularization so common plural forms still match.
    if len(token) > 4 and token.endswith("ies"):
        return f"{token[:-3]}y"
    if len(token) > 4 and token.endswith(("ses", "xes", "zes", "ches", "shes")):
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def normalized_tokens(text: str) -> list[str]:
    return [normalize_token(token) for token in TOKEN_PATTERN.findall(text.lower())]


def lexical_overlap_score(query_terms: set[str], document_terms: set[str]) -> float:
    if not query_terms or not document_terms:
        return 0.0
    return len(query_terms & document_terms) / len(query_terms)


class HashingEmbedder:
    def __init__(self, dimensions: int = 384) -> None:
        self.dimensions = dimensions

    def embed(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        tokens = normalized_tokens(text)

        if not tokens:
            return vector

        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            bucket = int.from_bytes(digest[:8], "big") % self.dimensions
            sign = 1.0 if digest[8] % 2 == 0 else -1.0
            vector[bucket] += sign

        return normalize(vector)


class VectorKnowledgeBase:
    def __init__(self, db_path: str, embedding_dimensions: int = 384) -> None:
        database_path = Path(db_path)
        database_path.parent.mkdir(parents=True, exist_ok=True)

        self._connection = sqlite3.connect(str(database_path), check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._lock = Lock()
        self._embedder = HashingEmbedder(dimensions=embedding_dimensions)

        with self._lock:
            self._connection.execute("PRAGMA foreign_keys = ON;")
            self._connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS document_vectors (
                    document_id TEXT PRIMARY KEY,
                    vector_json TEXT NOT NULL,
                    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_documents_updated_at
                    ON documents(updated_at DESC);
                """
            )
            self._connection.commit()

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def list_documents(self) -> list[dict]:
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT id, title, content, created_at, updated_at
                FROM documents
                ORDER BY updated_at DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def get_document(self, document_id: str) -> dict | None:
        with self._lock:
            row = self._connection.execute(
                """
                SELECT id, title, content, created_at, updated_at
                FROM documents
                WHERE id = ?
                """,
                (document_id,),
            ).fetchone()
        return dict(row) if row else None

    def create_document(self, title: str, content: str) -> dict:
        document_id = uuid.uuid4().hex
        now = utc_now_iso()
        vector = self._embedder.embed(f"{title}\n{content}")

        with self._lock:
            self._connection.execute(
                """
                INSERT INTO documents (id, title, content, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (document_id, title, content, now, now),
            )
            self._connection.execute(
                """
                INSERT INTO document_vectors (document_id, vector_json)
                VALUES (?, ?)
                """,
                (document_id, json.dumps(vector)),
            )
            self._connection.commit()

        created = self.get_document(document_id)
        if created is None:
            raise RuntimeError("Document was created but could not be loaded.")
        return created

    def update_document(self, document_id: str, title: str, content: str) -> dict | None:
        now = utc_now_iso()
        vector = self._embedder.embed(f"{title}\n{content}")

        with self._lock:
            update_result = self._connection.execute(
                """
                UPDATE documents
                SET title = ?, content = ?, updated_at = ?
                WHERE id = ?
                """,
                (title, content, now, document_id),
            )
            if update_result.rowcount == 0:
                return None

            self._connection.execute(
                """
                INSERT INTO document_vectors (document_id, vector_json)
                VALUES (?, ?)
                ON CONFLICT(document_id)
                DO UPDATE SET vector_json = excluded.vector_json
                """,
                (document_id, json.dumps(vector)),
            )
            self._connection.commit()

        return self.get_document(document_id)

    def delete_document(self, document_id: str) -> bool:
        with self._lock:
            result = self._connection.execute(
                """
                DELETE FROM documents
                WHERE id = ?
                """,
                (document_id,),
            )
            self._connection.commit()
        return result.rowcount > 0

    def search(self, query: str, limit: int = 5) -> list[dict]:
        query_vector = self._embedder.embed(query)
        query_terms = set(normalized_tokens(query))

        with self._lock:
            rows = self._connection.execute(
                """
                SELECT d.id, d.title, d.content, v.vector_json
                FROM documents d
                INNER JOIN document_vectors v
                    ON d.id = v.document_id
                """
            ).fetchall()

        ranked: list[tuple[float, dict]] = []
        for row in rows:
            stored_vector = json.loads(row["vector_json"])
            semantic_score = max(0.0, cosine_similarity(query_vector, stored_vector))
            document_terms = set(normalized_tokens(f"{row['title']}\n{row['content']}"))
            lexical_score = lexical_overlap_score(query_terms, document_terms)
            score = (semantic_score * 0.7) + (lexical_score * 0.3)

            if score <= 0.0:
                continue

            ranked.append(
                (
                    score,
                    {
                        "id": row["id"],
                        "title": row["title"],
                        "content_preview": self._content_preview(row["content"]),
                    },
                )
            )

        ranked.sort(key=lambda item: item[0], reverse=True)
        return [
            {**payload, "score": float(score)}
            for score, payload in ranked[:limit]
        ]

    @staticmethod
    def _content_preview(content: str, max_chars: int = 180) -> str:
        collapsed = " ".join(content.split())
        if len(collapsed) <= max_chars:
            return collapsed
        return f"{collapsed[:max_chars - 3]}..."
