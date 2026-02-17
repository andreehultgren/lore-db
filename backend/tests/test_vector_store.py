"""Tests for the VectorKnowledgeBase and supporting utilities."""

import math

import pytest

from app.vector_store import (
    HashingEmbedder,
    VectorKnowledgeBase,
    cosine_similarity,
    lexical_overlap_score,
    normalize,
    normalize_token,
    normalized_tokens,
)


# ── Helper functions ──


class TestNormalize:
    def test_normalizes_to_unit_length(self):
        result = normalize([3.0, 4.0])
        length = math.sqrt(sum(v * v for v in result))
        assert abs(length - 1.0) < 1e-9

    def test_zero_vector_unchanged(self):
        result = normalize([0.0, 0.0, 0.0])
        assert result == [0.0, 0.0, 0.0]


class TestCosineSimilarity:
    def test_identical_vectors(self):
        v = normalize([1.0, 2.0, 3.0])
        assert abs(cosine_similarity(v, v) - 1.0) < 1e-9

    def test_orthogonal_vectors(self):
        a = [1.0, 0.0]
        b = [0.0, 1.0]
        assert abs(cosine_similarity(a, b)) < 1e-9


class TestNormalizeToken:
    def test_lowercases(self):
        assert normalize_token("Hello") == "hello"

    def test_removes_plural_s(self):
        assert normalize_token("documents") == "document"

    def test_removes_ies_suffix(self):
        assert normalize_token("queries") == "query"

    def test_removes_es_suffix(self):
        assert normalize_token("boxes") == "box"

    def test_short_word_unchanged(self):
        assert normalize_token("as") == "as"

    def test_ss_ending_unchanged(self):
        assert normalize_token("class") == "class"


class TestNormalizedTokens:
    def test_tokenizes_and_normalizes(self):
        result = normalized_tokens("Hello World documents")
        assert result == ["hello", "world", "document"]

    def test_empty_string(self):
        assert normalized_tokens("") == []


class TestLexicalOverlapScore:
    def test_full_overlap(self):
        q = {"python", "code"}
        d = {"python", "code", "example"}
        assert lexical_overlap_score(q, d) == 1.0

    def test_partial_overlap(self):
        q = {"python", "code"}
        d = {"python", "example"}
        assert lexical_overlap_score(q, d) == 0.5

    def test_no_overlap(self):
        q = {"python"}
        d = {"javascript"}
        assert lexical_overlap_score(q, d) == 0.0

    def test_empty_query(self):
        assert lexical_overlap_score(set(), {"a"}) == 0.0

    def test_empty_document(self):
        assert lexical_overlap_score({"a"}, set()) == 0.0


# ── HashingEmbedder ──


class TestHashingEmbedder:
    def test_output_dimensions(self):
        embedder = HashingEmbedder(dimensions=128)
        vec = embedder.embed("hello world")
        assert len(vec) == 128

    def test_output_is_normalized(self):
        embedder = HashingEmbedder()
        vec = embedder.embed("test document about python")
        length = math.sqrt(sum(v * v for v in vec))
        assert abs(length - 1.0) < 1e-9

    def test_empty_text_returns_zero_vector(self):
        embedder = HashingEmbedder(dimensions=64)
        vec = embedder.embed("")
        assert all(v == 0.0 for v in vec)

    def test_similar_texts_have_higher_similarity(self):
        embedder = HashingEmbedder()
        a = embedder.embed("python programming language")
        b = embedder.embed("python coding language")
        c = embedder.embed("quantum physics experiments")
        sim_ab = cosine_similarity(a, b)
        sim_ac = cosine_similarity(a, c)
        assert sim_ab > sim_ac

    def test_deterministic(self):
        embedder = HashingEmbedder()
        a = embedder.embed("hello world")
        b = embedder.embed("hello world")
        assert a == b


# ── VectorKnowledgeBase CRUD ──


class TestVectorKnowledgeBaseCRUD:
    def test_create_document(self, kb):
        doc = kb.create_document(title="Test", content="Hello")
        assert doc["title"] == "Test"
        assert doc["content"] == "Hello"
        assert "id" in doc
        assert "created_at" in doc
        assert "updated_at" in doc

    def test_list_documents_empty(self, kb):
        docs = kb.list_documents()
        assert docs == []

    def test_list_documents_returns_created(self, kb):
        kb.create_document(title="Doc 1", content="Content 1")
        kb.create_document(title="Doc 2", content="Content 2")
        docs = kb.list_documents()
        assert len(docs) == 2

    def test_list_documents_ordered_by_updated_at_desc(self, kb):
        d1 = kb.create_document(title="First", content="")
        d2 = kb.create_document(title="Second", content="")
        docs = kb.list_documents()
        # Most recently created should be first
        assert docs[0]["id"] == d2["id"]
        assert docs[1]["id"] == d1["id"]

    def test_get_document(self, kb):
        created = kb.create_document(title="Test", content="Body")
        fetched = kb.get_document(created["id"])
        assert fetched is not None
        assert fetched["title"] == "Test"
        assert fetched["content"] == "Body"

    def test_get_document_not_found(self, kb):
        assert kb.get_document("nonexistent") is None

    def test_update_document(self, kb):
        created = kb.create_document(title="Original", content="Body")
        updated = kb.update_document(created["id"], title="Updated", content="New body")
        assert updated is not None
        assert updated["title"] == "Updated"
        assert updated["content"] == "New body"
        assert updated["created_at"] == created["created_at"]
        assert updated["updated_at"] >= created["updated_at"]

    def test_update_document_not_found(self, kb):
        result = kb.update_document("nonexistent", title="X", content="Y")
        assert result is None

    def test_delete_document(self, kb):
        created = kb.create_document(title="To Delete", content="")
        assert kb.delete_document(created["id"]) is True
        assert kb.get_document(created["id"]) is None

    def test_delete_document_not_found(self, kb):
        assert kb.delete_document("nonexistent") is False

    def test_delete_removes_from_list(self, kb):
        d = kb.create_document(title="Temp", content="")
        kb.delete_document(d["id"])
        docs = kb.list_documents()
        assert all(doc["id"] != d["id"] for doc in docs)


# ── VectorKnowledgeBase Search ──


class TestVectorKnowledgeBaseSearch:
    def test_search_returns_results(self, kb_with_docs):
        results = kb_with_docs.search("python", limit=5)
        assert len(results) > 0
        assert results[0]["title"] == "Python Basics"

    def test_search_respects_limit(self, kb_with_docs):
        results = kb_with_docs.search("python", limit=1)
        assert len(results) <= 1

    def test_search_result_has_expected_fields(self, kb_with_docs):
        results = kb_with_docs.search("python", limit=1)
        result = results[0]
        assert "id" in result
        assert "title" in result
        assert "content_preview" in result
        assert "score" in result
        assert isinstance(result["score"], float)

    def test_search_results_ordered_by_score_desc(self, kb_with_docs):
        results = kb_with_docs.search("programming", limit=10)
        scores = [r["score"] for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_search_empty_results(self, kb):
        results = kb.search("xyznonexistent")
        assert results == []

    def test_search_after_update_reflects_new_content(self, kb):
        doc = kb.create_document(title="Original", content="apples and oranges")
        kb.update_document(
            doc["id"], title="Updated", content="quantum physics experiments"
        )
        results = kb.search("quantum physics")
        assert any(r["id"] == doc["id"] for r in results)


# ── Content preview ──


class TestContentPreview:
    def test_short_content_unchanged(self):
        assert VectorKnowledgeBase._content_preview("Hello world") == "Hello world"

    def test_long_content_truncated(self):
        long_text = "a" * 300
        preview = VectorKnowledgeBase._content_preview(long_text, max_chars=50)
        assert len(preview) == 50
        assert preview.endswith("...")

    def test_whitespace_collapsed(self):
        text = "hello   world\n\nnew  line"
        assert VectorKnowledgeBase._content_preview(text) == "hello world new line"
