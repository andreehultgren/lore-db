import os
from functools import lru_cache
from pathlib import Path

from .vector_store import VectorKnowledgeBase


def _default_db_path() -> str:
    configured_path = os.getenv("KB_DB_PATH")
    if configured_path:
        return configured_path

    backend_root = Path(__file__).resolve().parent.parent
    return str(backend_root / "data" / "knowledge_base.db")


@lru_cache(maxsize=1)
def get_kb() -> VectorKnowledgeBase:
    return VectorKnowledgeBase(db_path=_default_db_path())


def reload_kb() -> VectorKnowledgeBase:
    if get_kb.cache_info().currsize > 0:
        existing = get_kb()
        existing.close()
        get_kb.cache_clear()
    return get_kb()
