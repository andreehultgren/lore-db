"""Analytics store for MCP usage tracking."""

import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AnalyticsStore:
    def __init__(self, db_path: str) -> None:
        self._path = db_path
        self._lock = Lock()
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._migrate()

    def _migrate(self) -> None:
        with self._lock:
            self._conn.executescript("""
                CREATE TABLE IF NOT EXISTS mcp_events (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    namespace TEXT NOT NULL DEFAULT '',
                    document_id TEXT,
                    document_title TEXT,
                    query TEXT,
                    result_count INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_mcp_events_event_type
                    ON mcp_events(event_type);
                CREATE INDEX IF NOT EXISTS idx_mcp_events_timestamp
                    ON mcp_events(timestamp);
                CREATE INDEX IF NOT EXISTS idx_mcp_events_namespace
                    ON mcp_events(namespace);
            """)
            self._conn.commit()

    def log(
        self,
        event_type: str,
        namespace: str = "",
        document_id: str | None = None,
        document_title: str | None = None,
        query: str | None = None,
        result_count: int | None = None,
    ) -> dict:
        event_id = str(uuid.uuid4())
        timestamp = _utc_now_iso()
        with self._lock:
            self._conn.execute(
                """INSERT INTO mcp_events
                   (id, timestamp, event_type, namespace, document_id, document_title, query, result_count)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (event_id, timestamp, event_type, namespace or "", document_id, document_title, query, result_count),
            )
            self._conn.commit()
        return {
            "id": event_id,
            "timestamp": timestamp,
            "event_type": event_type,
            "namespace": namespace or "",
            "document_id": document_id,
            "document_title": document_title,
            "query": query,
            "result_count": result_count,
        }

    def get_events(
        self,
        limit: int = 50,
        offset: int = 0,
        event_type: str | None = None,
        namespace: str | None = None,
    ) -> dict:
        where_parts: list[str] = []
        params: list = []
        if event_type:
            where_parts.append("event_type = ?")
            params.append(event_type)
        if namespace is not None:
            where_parts.append("namespace = ?")
            params.append(namespace)
        where = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
        with self._lock:
            total = self._conn.execute(
                f"SELECT COUNT(*) FROM mcp_events {where}", params
            ).fetchone()[0]
            rows = self._conn.execute(
                f"SELECT * FROM mcp_events {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
                params + [limit, offset],
            ).fetchall()
        return {"events": [dict(r) for r in rows], "total": total}

    def get_stats(self, namespace: str | None = None) -> dict:
        base_parts: list[str] = []
        base_params: list = []
        if namespace is not None:
            base_parts.append("namespace = ?")
            base_params.append(namespace)

        def _where(extra: list[str] | None = None) -> str:
            parts = base_parts + (extra or [])
            return f"WHERE {' AND '.join(parts)}" if parts else ""

        with self._lock:
            total = self._conn.execute(
                f"SELECT COUNT(*) FROM mcp_events {_where()}", base_params
            ).fetchone()[0]

            by_type_rows = self._conn.execute(
                f"SELECT event_type, COUNT(*) as cnt FROM mcp_events {_where()} GROUP BY event_type",
                base_params,
            ).fetchall()
            events_by_type = {r["event_type"]: r["cnt"] for r in by_type_rows}

            top_searches = self._conn.execute(
                f"""SELECT query, COUNT(*) as count FROM mcp_events
                    {_where(["event_type = 'search'", "query IS NOT NULL"])}
                    GROUP BY query ORDER BY count DESC LIMIT 10""",
                base_params,
            ).fetchall()

            top_docs = self._conn.execute(
                f"""SELECT document_id, document_title, COUNT(*) as count FROM mcp_events
                    {_where(["event_type = 'get_document'", "document_id IS NOT NULL"])}
                    GROUP BY document_id ORDER BY count DESC LIMIT 10""",
                base_params,
            ).fetchall()

            recent = self._conn.execute(
                f"SELECT * FROM mcp_events {_where()} ORDER BY timestamp DESC LIMIT 20",
                base_params,
            ).fetchall()

        return {
            "total_events": total,
            "events_by_type": events_by_type,
            "top_searches": [{"query": r["query"], "count": r["count"]} for r in top_searches],
            "top_documents": [
                {
                    "document_id": r["document_id"],
                    "document_title": r["document_title"],
                    "count": r["count"],
                }
                for r in top_docs
            ],
            "recent_events": [dict(r) for r in recent],
        }

    def close(self) -> None:
        self._conn.close()


_store: AnalyticsStore | None = None
_store_lock = Lock()


def get_analytics() -> AnalyticsStore:
    global _store
    if _store is None:
        with _store_lock:
            if _store is None:
                path = os.getenv("KB_ANALYTICS_DB_PATH") or str(
                    Path(__file__).resolve().parent.parent / "data" / "analytics.db"
                )
                _store = AnalyticsStore(path)
    return _store


def reset_analytics() -> None:
    """Close and discard the global analytics store. Used in tests."""
    global _store
    with _store_lock:
        if _store is not None:
            _store.close()
        _store = None
