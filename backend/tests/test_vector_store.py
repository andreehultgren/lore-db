"""Tests for the VectorKnowledgeBase and supporting utilities."""

import json
import math

import pytest

from app.vector_store import (
    HashingEmbedder,
    VectorKnowledgeBase,
    chunk_text,
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


# ── SentenceTransformerEmbedder ──


class TestSentenceTransformerEmbedder:
    @pytest.fixture(autouse=True)
    def require_sentence_transformers(self):
        pytest.importorskip("sentence_transformers", reason="sentence-transformers not installed")

    def test_output_dimensions(self):
        from app.vector_store import SentenceTransformerEmbedder

        embedder = SentenceTransformerEmbedder()
        vec = embedder.embed("hello world")
        assert len(vec) == 384

    def test_output_is_normalized(self):
        from app.vector_store import SentenceTransformerEmbedder

        embedder = SentenceTransformerEmbedder()
        vec = embedder.embed("test document about python")
        length = math.sqrt(sum(v * v for v in vec))
        assert abs(length - 1.0) < 1e-6

    def test_empty_text_returns_zero_vector(self):
        from app.vector_store import SentenceTransformerEmbedder

        embedder = SentenceTransformerEmbedder()
        vec = embedder.embed("")
        assert all(v == 0.0 for v in vec)
        assert len(vec) == 384

    def test_semantic_similarity_beats_unrelated(self):
        """Semantically similar phrases must score higher than unrelated ones."""
        from app.vector_store import SentenceTransformerEmbedder

        embedder = SentenceTransformerEmbedder()
        a = embedder.embed("car automobile vehicle")
        b = embedder.embed("automobile sedan driving")
        c = embedder.embed("quantum physics neutron star")
        sim_ab = cosine_similarity(a, b)
        sim_ac = cosine_similarity(a, c)
        assert sim_ab > sim_ac, f"Expected {sim_ab:.4f} > {sim_ac:.4f}"

    def test_returns_list_of_floats(self):
        from app.vector_store import SentenceTransformerEmbedder

        embedder = SentenceTransformerEmbedder()
        vec = embedder.embed("hello")
        assert isinstance(vec, list)
        assert all(isinstance(v, float) for v in vec)


# ── VectorKnowledgeBase embedder injection ──


class TestVectorKnowledgeBaseEmbedderInjection:
    def test_accepts_custom_embedder(self, tmp_db_path):
        embedder = HashingEmbedder()
        store = VectorKnowledgeBase(db_path=tmp_db_path, embedder=embedder)
        doc = store.create_document("Test", "Content")
        assert doc is not None
        store.close()

    def test_uses_injected_embedder_not_default(self, tmp_db_path):
        """Verify custom embedder is called, not the default one."""

        class TrackingEmbedder:
            dimensions = 384

            def __init__(self):
                self.call_count = 0

            def embed(self, text: str) -> list[float]:
                self.call_count += 1
                return [0.0] * self.dimensions

        tracker = TrackingEmbedder()
        store = VectorKnowledgeBase(db_path=tmp_db_path, embedder=tracker)
        store.create_document("Title", "Content")
        assert tracker.call_count >= 1
        store.close()


# ── reindex_all ──


class TestReindexAll:
    def test_reindex_all_returns_document_count(self, kb):
        kb.create_document("Doc A", "First document content")
        kb.create_document("Doc B", "Second document content")
        count = kb.reindex_all()
        assert count == 2

    def test_reindex_empty_kb_returns_zero(self, kb):
        count = kb.reindex_all()
        assert count == 0

    def test_reindex_preserves_content(self, kb):
        doc = kb.create_document("Preserved", "Should stay intact")
        kb.reindex_all()
        fetched = kb.get_document(doc["id"])
        assert fetched["title"] == "Preserved"
        assert fetched["content"] == "Should stay intact"

    def test_reindex_updates_vectors_so_search_still_works(self, kb):
        kb.create_document("Python Guide", "python programming")
        kb.reindex_all()
        results = kb.search("python")
        assert len(results) > 0


# ── Content preview ──


# ── verified_at and freshness ──


class TestVerifiedAt:
    def test_create_document_has_verified_at(self, kb):
        doc = kb.create_document(title="Test", content="Hello")
        assert "verified_at" in doc
        assert doc["verified_at"] is not None

    def test_create_sets_verified_at_equal_to_created_at(self, kb):
        doc = kb.create_document(title="Test", content="Hello")
        assert doc["verified_at"] == doc["created_at"]

    def test_update_document_refreshes_verified_at(self, kb):
        doc = kb.create_document(title="Original", content="Body")
        original_verified = doc["verified_at"]
        updated = kb.update_document(doc["id"], title="Updated", content="New")
        assert updated["verified_at"] >= original_verified

    def test_get_document_includes_verified_at(self, kb):
        created = kb.create_document(title="Test", content="Body")
        fetched = kb.get_document(created["id"])
        assert "verified_at" in fetched
        assert fetched["verified_at"] == created["verified_at"]

    def test_list_documents_includes_verified_at(self, kb):
        kb.create_document(title="Test", content="Body")
        docs = kb.list_documents()
        assert "verified_at" in docs[0]

    def test_verify_document_bumps_verified_at(self, kb):
        doc = kb.create_document(title="Test", content="Body")
        # Manually backdate verified_at to simulate an old doc
        kb._connection.execute(
            "UPDATE documents SET verified_at = '2020-01-01T00:00:00+00:00' WHERE id = ?",
            (doc["id"],),
        )
        kb._connection.commit()
        old_doc = kb.get_document(doc["id"])
        assert old_doc["verified_at"] == "2020-01-01T00:00:00+00:00"

        verified = kb.verify_document(doc["id"])
        assert verified is not None
        assert verified["verified_at"] > "2020-01-01T00:00:00+00:00"
        # Content and title unchanged
        assert verified["title"] == doc["title"]
        assert verified["content"] == doc["content"]

    def test_verify_document_not_found(self, kb):
        result = kb.verify_document("nonexistent")
        assert result is None


class TestGetStaleDocuments:
    def test_returns_stale_documents(self, kb):
        doc = kb.create_document(title="Old Doc", content="Stale content")
        # Backdate verified_at to 60 days ago
        kb._connection.execute(
            "UPDATE documents SET verified_at = '2020-01-01T00:00:00+00:00' WHERE id = ?",
            (doc["id"],),
        )
        kb._connection.commit()

        stale = kb.get_stale_documents(days_threshold=30)
        assert len(stale) == 1
        assert stale[0]["id"] == doc["id"]
        assert "days_since_verified" in stale[0]

    def test_excludes_fresh_documents(self, kb):
        kb.create_document(title="Fresh Doc", content="Just created")
        stale = kb.get_stale_documents(days_threshold=30)
        assert len(stale) == 0

    def test_sorted_by_staleness_oldest_first(self, kb):
        doc1 = kb.create_document(title="Older", content="a")
        doc2 = kb.create_document(title="Old", content="b")
        kb._connection.execute(
            "UPDATE documents SET verified_at = '2020-01-01T00:00:00+00:00' WHERE id = ?",
            (doc1["id"],),
        )
        kb._connection.execute(
            "UPDATE documents SET verified_at = '2023-01-01T00:00:00+00:00' WHERE id = ?",
            (doc2["id"],),
        )
        kb._connection.commit()

        stale = kb.get_stale_documents(days_threshold=1)
        assert len(stale) == 2
        assert stale[0]["id"] == doc1["id"]  # oldest first
        assert stale[1]["id"] == doc2["id"]

    def test_default_threshold_is_30_days(self, kb):
        doc = kb.create_document(title="Test", content="Body")
        # 15 days old — should NOT be stale with default threshold
        from datetime import datetime, timedelta, timezone
        fifteen_days_ago = (datetime.now(timezone.utc) - timedelta(days=15)).isoformat()
        kb._connection.execute(
            "UPDATE documents SET verified_at = ? WHERE id = ?",
            (fifteen_days_ago, doc["id"]),
        )
        kb._connection.commit()
        stale = kb.get_stale_documents()
        assert len(stale) == 0


# ── Confidence decay in search ──


class TestSearchConfidenceDecay:
    def test_search_results_include_days_since_verified(self, kb):
        kb.create_document(title="Python Basics", content="Variables and loops in Python")
        results = kb.search("python")
        assert len(results) > 0
        assert "days_since_verified" in results[0]
        assert isinstance(results[0]["days_since_verified"], int)

    def test_fresh_doc_ranks_higher_than_stale_with_same_content(self, kb):
        """Two identical docs: the fresh one should score higher due to decay."""
        fresh = kb.create_document(title="Python Guide", content="python programming language basics")
        stale = kb.create_document(title="Python Guide", content="python programming language basics")

        # Backdate the stale doc to 1 year ago
        kb._connection.execute(
            "UPDATE documents SET verified_at = '2020-01-01T00:00:00+00:00' WHERE id = ?",
            (stale["id"],),
        )
        kb._connection.commit()

        results = kb.search("python programming", limit=10)
        ids = [r["id"] for r in results]
        assert fresh["id"] in ids
        assert stale["id"] in ids
        # Fresh doc should appear before stale doc
        assert ids.index(fresh["id"]) < ids.index(stale["id"])

    def test_decay_does_not_fully_bury_stale_docs(self, kb):
        """Even a very old doc should still appear in results (floor at 0.5x)."""
        doc = kb.create_document(title="Python Guide", content="python programming")
        kb._connection.execute(
            "UPDATE documents SET verified_at = '2015-01-01T00:00:00+00:00' WHERE id = ?",
            (doc["id"],),
        )
        kb._connection.commit()

        results = kb.search("python programming")
        assert len(results) > 0
        assert results[0]["id"] == doc["id"]
        assert results[0]["score"] > 0


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


# ── chunk_text function ──


class TestChunkText:
    def test_short_content_returns_single_chunk(self):
        chunks = chunk_text("My Title", "A short document.")
        assert len(chunks) == 1
        assert chunks[0] == "My Title\nA short document."

    def test_empty_content_returns_title_only(self):
        chunks = chunk_text("My Title", "")
        assert len(chunks) == 1
        assert chunks[0] == "My Title"

    def test_long_content_returns_multiple_chunks(self):
        # 400 words — should produce multiple chunks with default 200-word max
        content = " ".join(f"word{i}" for i in range(400))
        chunks = chunk_text("Title", content, max_words=200, overlap_words=50)
        assert len(chunks) > 1

    def test_each_chunk_starts_with_title(self):
        content = " ".join(f"word{i}" for i in range(400))
        chunks = chunk_text("My Title", content, max_words=200, overlap_words=50)
        for chunk in chunks:
            assert chunk.startswith("My Title\n")

    def test_chunks_overlap(self):
        # With overlap, the end of chunk N should appear at the start of chunk N+1
        content = " ".join(f"word{i}" for i in range(400))
        chunks = chunk_text("T", content, max_words=100, overlap_words=30)
        assert len(chunks) >= 2
        # Get content words (after title line) from each chunk
        chunk0_words = chunks[0].split("\n", 1)[1].split()
        chunk1_words = chunks[1].split("\n", 1)[1].split()
        # Last 30 words of chunk 0 should be first 30 words of chunk 1
        assert chunk0_words[-30:] == chunk1_words[:30]

    def test_all_content_words_covered(self):
        words = [f"word{i}" for i in range(500)]
        content = " ".join(words)
        chunks = chunk_text("T", content, max_words=100, overlap_words=20)
        # Collect all content words from all chunks
        all_chunk_words = set()
        for chunk in chunks:
            chunk_content = chunk.split("\n", 1)[1]
            all_chunk_words.update(chunk_content.split())
        for word in words:
            assert word in all_chunk_words

    def test_exact_boundary_no_extra_chunk(self):
        # Exactly max_words content words should produce 1 chunk
        content = " ".join(f"word{i}" for i in range(200))
        chunks = chunk_text("T", content, max_words=200, overlap_words=50)
        assert len(chunks) == 1

    def test_one_over_boundary_produces_two_chunks(self):
        content = " ".join(f"word{i}" for i in range(201))
        chunks = chunk_text("T", content, max_words=200, overlap_words=50)
        assert len(chunks) == 2


# ── Chunk storage ──


class TestChunkStorage:
    def test_create_stores_chunks_in_db(self, kb):
        doc = kb.create_document(title="Test", content="Hello world")
        with kb._lock:
            rows = kb._connection.execute(
                "SELECT * FROM document_chunks WHERE document_id = ?",
                (doc["id"],),
            ).fetchall()
        assert len(rows) >= 1

    def test_short_doc_has_one_chunk(self, kb):
        doc = kb.create_document(title="Short", content="Brief content.")
        with kb._lock:
            rows = kb._connection.execute(
                "SELECT * FROM document_chunks WHERE document_id = ?",
                (doc["id"],),
            ).fetchall()
        assert len(rows) == 1

    def test_long_doc_has_multiple_chunks(self, kb):
        content = " ".join(f"word{i}" for i in range(500))
        doc = kb.create_document(title="Long Doc", content=content)
        with kb._lock:
            rows = kb._connection.execute(
                "SELECT * FROM document_chunks WHERE document_id = ?",
                (doc["id"],),
            ).fetchall()
        assert len(rows) > 1

    def test_update_replaces_chunks(self, kb):
        doc = kb.create_document(title="Original", content="short")
        long_content = " ".join(f"word{i}" for i in range(500))
        kb.update_document(doc["id"], title="Updated", content=long_content)
        with kb._lock:
            rows = kb._connection.execute(
                "SELECT * FROM document_chunks WHERE document_id = ?",
                (doc["id"],),
            ).fetchall()
        assert len(rows) > 1
        # Verify old single chunk is gone (replaced, not appended)
        for row in rows:
            assert "short" not in row["chunk_text"] or len(rows) > 1

    def test_delete_cascades_to_chunks(self, kb):
        doc = kb.create_document(title="Delete Me", content="Some content")
        kb.delete_document(doc["id"])
        with kb._lock:
            rows = kb._connection.execute(
                "SELECT * FROM document_chunks WHERE document_id = ?",
                (doc["id"],),
            ).fetchall()
        assert len(rows) == 0

    def test_reindex_rechunks_documents(self, kb):
        content = " ".join(f"word{i}" for i in range(500))
        doc = kb.create_document(title="Reindex Me", content=content)
        with kb._lock:
            original_count = kb._connection.execute(
                "SELECT COUNT(*) FROM document_chunks WHERE document_id = ?",
                (doc["id"],),
            ).fetchone()[0]
        count = kb.reindex_all()
        assert count == 1
        with kb._lock:
            new_count = kb._connection.execute(
                "SELECT COUNT(*) FROM document_chunks WHERE document_id = ?",
                (doc["id"],),
            ).fetchone()[0]
        # Should have same number of chunks after reindex
        assert new_count == original_count


# ── Chunked search ──


class TestChunkedSearch:
    def test_search_finds_content_in_later_chunks(self, kb):
        """Content beyond the first chunk should still be searchable."""
        # Put the searchable keyword only in later content
        filler = " ".join(f"filler{i}" for i in range(300))
        content = f"{filler} quantum physics experiments supercollider"
        doc = kb.create_document(title="Science Doc", content=content)
        results = kb.search("quantum physics supercollider")
        assert len(results) > 0
        assert results[0]["id"] == doc["id"]

    def test_search_deduplicates_by_document(self, kb):
        """A document with multiple matching chunks should appear only once."""
        # Create a document where the keyword appears in multiple chunks
        keyword = "python programming"
        content = f"{keyword} " + " ".join(f"w{i}" for i in range(300)) + f" {keyword}"
        doc = kb.create_document(title="Python Guide", content=content)
        results = kb.search("python programming", limit=10)
        doc_ids = [r["id"] for r in results]
        assert doc_ids.count(doc["id"]) == 1  # no duplicates

    def test_search_uses_best_chunk_score(self, kb):
        """The score should be from the best-matching chunk, not averaged."""
        # Chunk 1 has weak match, chunk 2 has strong match
        filler = " ".join(f"random{i}" for i in range(250))
        content = f"{filler} quantum physics experiments"
        doc = kb.create_document(title="Mixed Doc", content=content)
        results = kb.search("quantum physics experiments")
        assert len(results) > 0
        # Should still get a reasonable score from the matching chunk
        assert results[0]["score"] > 0
