import os
import re
from functools import lru_cache
from pathlib import Path

from .vector_store import VectorKnowledgeBase

_SAFE_NAMESPACE = re.compile(r"^[a-zA-Z0-9_\-]+$")


def _db_path_for_namespace(namespace: str) -> str:
    configured_path = os.getenv("KB_DB_PATH")
    backend_root = Path(__file__).resolve().parent.parent
    base = (
        Path(configured_path)
        if configured_path
        else backend_root / "data" / "knowledge_base.db"
    )

    if not namespace:
        return str(base)

    if not _SAFE_NAMESPACE.match(namespace):
        raise ValueError(
            f"Invalid KB_NAMESPACE: {namespace!r}. Use only alphanumeric, hyphens, and underscores."
        )

    # Insert namespace before .db extension: knowledge_base_myproject.db
    return str(base.with_stem(f"{base.stem}_{namespace}"))


@lru_cache(maxsize=32)
def get_kb(namespace: str = "") -> VectorKnowledgeBase:
    return VectorKnowledgeBase(db_path=_db_path_for_namespace(namespace))


def reload_kb(namespace: str = "") -> VectorKnowledgeBase:
    try:
        existing = get_kb(namespace)
        existing.close()
    except Exception:
        pass
    get_kb.cache_clear()
    return get_kb(namespace)


def list_namespaces() -> list[str]:
    """Scan the data directory for namespace DB files and return namespace names."""
    configured_path = os.getenv("KB_DB_PATH")
    backend_root = Path(__file__).resolve().parent.parent
    base = (
        Path(configured_path)
        if configured_path
        else backend_root / "data" / "knowledge_base.db"
    )

    data_dir = base.parent
    stem = base.stem  # e.g. "knowledge_base"

    namespaces: list[str] = []
    if not data_dir.is_dir():
        return namespaces

    for db_file in sorted(data_dir.glob(f"{stem}_*.db")):
        # Extract namespace from filename: knowledge_base_myproject.db -> myproject
        suffix = db_file.stem[len(stem) + 1 :]
        if suffix and _SAFE_NAMESPACE.match(suffix):
            namespaces.append(suffix)

    return namespaces
