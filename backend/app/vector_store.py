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

# Detect sentence-transformers at import time so the fallback kicks in without
# raising at module level.
try:
    import sentence_transformers as _sentence_transformers_pkg  # noqa: F401

    _SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    _SENTENCE_TRANSFORMERS_AVAILABLE = False

# Module-level singleton: the ST model is heavy to load, so we load it once and
# share it across all SentenceTransformerEmbedder instances.
_st_model = None
_st_model_lock = Lock()


def _load_st_model(model_name: str):
    global _st_model
    if _st_model is None:
        with _st_model_lock:
            if _st_model is None:
                from sentence_transformers import SentenceTransformer

                _st_model = SentenceTransformer(model_name)
    return _st_model


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


def chunk_text(
    title: str,
    content: str,
    max_words: int = 200,
    overlap_words: int = 50,
) -> list[str]:
    """Split document into overlapping chunks, each prefixed with the title.

    Returns at least one chunk. Short documents (≤ max_words content words)
    produce a single chunk. Longer documents are split with overlap so context
    at chunk boundaries is preserved.
    """
    words = content.split()
    if not words:
        return [title]
    if len(words) <= max_words:
        return [f"{title}\n{content}"]

    chunks: list[str] = []
    step = max(max_words - overlap_words, 1)
    start = 0
    while start < len(words):
        chunk_words = words[start : start + max_words]
        chunks.append(f"{title}\n{' '.join(chunk_words)}")
        start += step
    return chunks


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


class SentenceTransformerEmbedder:
    """Semantic embedder using sentence-transformers (384-dim by default).

    The underlying model is loaded lazily on the first embed() call and then
    cached as a module-level singleton, so repeated instantiation is free.

    Set the ``KB_EMBEDDING_MODEL`` env var to switch models (e.g.
    ``BAAI/bge-small-en-v1.5`` for a 512-token window). After changing the
    model, run ``reindex_documents()`` to re-chunk and re-embed all documents.
    """

    DEFAULT_MODEL = "all-MiniLM-L6-v2"

    def __init__(self) -> None:
        import os

        self.model_name = os.getenv("KB_EMBEDDING_MODEL", self.DEFAULT_MODEL)

    @property
    def dimensions(self) -> int:  # type: ignore[override]
        model = _load_st_model(self.model_name)
        return model.get_sentence_embedding_dimension()

    def embed(self, text: str) -> list[float]:
        if not text or not text.strip():
            model = _load_st_model(self.model_name)
            return [0.0] * model.get_sentence_embedding_dimension()
        model = _load_st_model(self.model_name)
        embedding = model.encode(text, normalize_embeddings=True)
        return embedding.tolist()


def _make_default_embedder():
    """Return a SentenceTransformerEmbedder when the package is available,
    otherwise fall back to HashingEmbedder so the server remains functional."""
    if _SENTENCE_TRANSFORMERS_AVAILABLE:
        return SentenceTransformerEmbedder()
    return HashingEmbedder()


class VectorKnowledgeBase:
    def __init__(self, db_path: str, embedder=None) -> None:
        database_path = Path(db_path)
        database_path.parent.mkdir(parents=True, exist_ok=True)

        self._connection = sqlite3.connect(str(database_path), check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._lock = Lock()
        self._embedder = embedder if embedder is not None else _make_default_embedder()

        with self._lock:
            self._connection.execute("PRAGMA foreign_keys = ON;")
            self._connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    verified_at TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS document_chunks (
                    chunk_id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    chunk_text TEXT NOT NULL,
                    vector_json TEXT NOT NULL,
                    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_chunks_document_id
                    ON document_chunks(document_id);

                CREATE INDEX IF NOT EXISTS idx_documents_updated_at
                    ON documents(updated_at DESC);
                """
            )
            # Migrate existing databases that lack verified_at
            try:
                self._connection.execute(
                    "ALTER TABLE documents ADD COLUMN verified_at TEXT NOT NULL DEFAULT ''"
                )
                self._connection.execute(
                    "UPDATE documents SET verified_at = updated_at WHERE verified_at = ''"
                )
                self._connection.commit()
            except sqlite3.OperationalError:
                pass
            # Migrate from old document_vectors table to document_chunks
            self._migrate_vectors_to_chunks()
            self._connection.commit()

    def _migrate_vectors_to_chunks(self) -> None:
        """Migrate data from old document_vectors table to document_chunks."""
        tables = {
            row[0]
            for row in self._connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        if "document_vectors" not in tables:
            return
        # Check if there's data to migrate
        old_rows = self._connection.execute(
            "SELECT document_id, vector_json FROM document_vectors"
        ).fetchall()
        if old_rows:
            for row in old_rows:
                chunk_id = uuid.uuid4().hex
                # Get document text for chunk_text field
                doc = self._connection.execute(
                    "SELECT title, content FROM documents WHERE id = ?",
                    (row["document_id"],),
                ).fetchone()
                text = f"{doc['title']}\n{doc['content']}" if doc else ""
                self._connection.execute(
                    """
                    INSERT OR IGNORE INTO document_chunks
                        (chunk_id, document_id, chunk_index, chunk_text, vector_json)
                    VALUES (?, ?, 0, ?, ?)
                    """,
                    (chunk_id, row["document_id"], text, row["vector_json"]),
                )
        self._connection.execute("DROP TABLE document_vectors")

    def _store_chunks(self, document_id: str, title: str, content: str) -> None:
        """Chunk a document, embed each chunk, and store in document_chunks."""
        chunks = chunk_text(title, content)
        # Delete existing chunks for this document
        self._connection.execute(
            "DELETE FROM document_chunks WHERE document_id = ?", (document_id,)
        )
        for idx, text in enumerate(chunks):
            vector = self._embedder.embed(text)
            chunk_id = uuid.uuid4().hex
            self._connection.execute(
                """
                INSERT INTO document_chunks
                    (chunk_id, document_id, chunk_index, chunk_text, vector_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (chunk_id, document_id, idx, text, json.dumps(vector)),
            )

    def reindex_all(self) -> int:
        """Re-chunk and re-embed all documents. Returns count of reindexed docs."""
        with self._lock:
            rows = self._connection.execute(
                "SELECT id, title, content FROM documents"
            ).fetchall()

        count = 0
        for row in rows:
            with self._lock:
                self._store_chunks(row["id"], row["title"], row["content"])
                self._connection.commit()
            count += 1

        return count

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def list_documents(self) -> list[dict]:
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT id, title, content, created_at, updated_at, verified_at
                FROM documents
                ORDER BY updated_at DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def get_document(self, document_id: str) -> dict | None:
        with self._lock:
            row = self._connection.execute(
                """
                SELECT id, title, content, created_at, updated_at, verified_at
                FROM documents
                WHERE id = ?
                """,
                (document_id,),
            ).fetchone()
        return dict(row) if row else None

    def create_document(self, title: str, content: str) -> dict:
        document_id = uuid.uuid4().hex
        now = utc_now_iso()

        with self._lock:
            self._connection.execute(
                """
                INSERT INTO documents (id, title, content, created_at, updated_at, verified_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (document_id, title, content, now, now, now),
            )
            self._store_chunks(document_id, title, content)
            self._connection.commit()

        created = self.get_document(document_id)
        if created is None:
            raise RuntimeError("Document was created but could not be loaded.")
        return created

    def update_document(
        self, document_id: str, title: str, content: str
    ) -> dict | None:
        now = utc_now_iso()

        with self._lock:
            update_result = self._connection.execute(
                """
                UPDATE documents
                SET title = ?, content = ?, updated_at = ?, verified_at = ?
                WHERE id = ?
                """,
                (title, content, now, now, document_id),
            )
            if update_result.rowcount == 0:
                return None

            self._store_chunks(document_id, title, content)
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

    def verify_document(self, document_id: str) -> dict | None:
        """Bump verified_at without changing content or title. Returns updated doc or None."""
        now = utc_now_iso()
        with self._lock:
            result = self._connection.execute(
                "UPDATE documents SET verified_at = ? WHERE id = ?",
                (now, document_id),
            )
            if result.rowcount == 0:
                return None
            self._connection.commit()
        return self.get_document(document_id)

    def get_stale_documents(self, days_threshold: int = 30) -> list[dict]:
        """Return documents not verified within days_threshold, oldest first."""
        now = datetime.now(timezone.utc)
        docs = self.list_documents()
        stale: list[dict] = []
        for doc in docs:
            verified = datetime.fromisoformat(doc["verified_at"])
            days = (now - verified).days
            if days >= days_threshold:
                stale.append({
                    "id": doc["id"],
                    "title": doc["title"],
                    "verified_at": doc["verified_at"],
                    "days_since_verified": days,
                })
        stale.sort(key=lambda d: d["verified_at"])
        return stale

    @staticmethod
    def _days_since(iso_timestamp: str) -> int:
        verified = datetime.fromisoformat(iso_timestamp)
        return (datetime.now(timezone.utc) - verified).days

    @staticmethod
    def _freshness_decay(days: int) -> float:
        """Confidence decay: 1.0 for fresh docs, floors at 0.5 for 1yr+ old."""
        return max(0.5, 1.0 - (days / 365.0))

    def search(self, query: str, limit: int = 5) -> list[dict]:
        query_vector = self._embedder.embed(query)
        query_terms = set(normalized_tokens(query))

        with self._lock:
            rows = self._connection.execute(
                """
                SELECT c.document_id, c.chunk_text, c.vector_json,
                       d.title, d.content, d.verified_at
                FROM document_chunks c
                INNER JOIN documents d ON d.id = c.document_id
                """
            ).fetchall()

        # Score each chunk, keep best per document
        best_per_doc: dict[str, tuple[float, dict]] = {}
        for row in rows:
            stored_vector = json.loads(row["vector_json"])
            semantic_score = max(0.0, cosine_similarity(query_vector, stored_vector))
            chunk_terms = set(normalized_tokens(row["chunk_text"]))
            lexical_score = lexical_overlap_score(query_terms, chunk_terms)
            raw_score = (semantic_score * 0.7) + (lexical_score * 0.3)

            if raw_score <= 0.0:
                continue

            days = self._days_since(row["verified_at"]) if row["verified_at"] else 0
            decay = self._freshness_decay(days)
            score = raw_score * decay

            doc_id = row["document_id"]
            if doc_id not in best_per_doc or score > best_per_doc[doc_id][0]:
                best_per_doc[doc_id] = (
                    score,
                    {
                        "id": doc_id,
                        "title": row["title"],
                        "content_preview": self._content_preview(row["content"]),
                        "days_since_verified": days,
                    },
                )

        ranked = sorted(best_per_doc.values(), key=lambda item: item[0], reverse=True)
        return [{**payload, "score": float(score)} for score, payload in ranked[:limit]]

    @staticmethod
    def _content_preview(content: str, max_chars: int = 180) -> str:
        collapsed = " ".join(content.split())
        if len(collapsed) <= max_chars:
            return collapsed
        return f"{collapsed[:max_chars - 3]}..."
