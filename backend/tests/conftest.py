import os
import tempfile

import pytest

from app.vector_store import VectorKnowledgeBase


@pytest.fixture()
def tmp_db_path(tmp_path):
    """Return a temporary database file path."""
    return str(tmp_path / "test_kb.db")


@pytest.fixture()
def kb(tmp_db_path):
    """Create a VectorKnowledgeBase backed by a temporary database."""
    store = VectorKnowledgeBase(db_path=tmp_db_path)
    yield store
    store.close()


@pytest.fixture()
def kb_with_docs(kb):
    """A VectorKnowledgeBase pre-populated with three documents."""
    kb.create_document(title="Python Basics", content="Variables, loops, and functions in Python.")
    kb.create_document(title="JavaScript Guide", content="Learn about closures and prototypes.")
    kb.create_document(title="Database Design", content="Normalization, indexes, and query optimization.")
    return kb
