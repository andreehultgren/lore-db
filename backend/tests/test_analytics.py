"""Tests for the AnalyticsStore."""

import pytest

from app.analytics import AnalyticsStore


@pytest.fixture()
def store(tmp_path):
    s = AnalyticsStore(db_path=str(tmp_path / "analytics.db"))
    yield s
    s.close()


# ── Init ──


class TestAnalyticsStoreInit:
    def test_creates_db_file(self, tmp_path):
        path = str(tmp_path / "analytics.db")
        s = AnalyticsStore(db_path=path)
        s.close()
        assert (tmp_path / "analytics.db").exists()

    def test_creates_parent_directories(self, tmp_path):
        path = str(tmp_path / "nested" / "dir" / "analytics.db")
        s = AnalyticsStore(db_path=path)
        s.close()
        assert (tmp_path / "nested" / "dir" / "analytics.db").exists()


# ── log() ──


class TestLog:
    def test_returns_event_dict(self, store):
        event = store.log("search", query="python")
        assert event["event_type"] == "search"
        assert event["query"] == "python"
        assert "id" in event
        assert "timestamp" in event

    def test_stores_event_in_db(self, store):
        store.log("search", namespace="ns1", query="hello world", result_count=3)
        result = store.get_events()
        assert result["total"] == 1
        ev = result["events"][0]
        assert ev["query"] == "hello world"
        assert ev["namespace"] == "ns1"
        assert ev["result_count"] == 3

    def test_get_document_event(self, store):
        store.log("get_document", document_id="doc-1", document_title="Python Guide")
        ev = store.get_events()["events"][0]
        assert ev["event_type"] == "get_document"
        assert ev["document_id"] == "doc-1"
        assert ev["document_title"] == "Python Guide"

    def test_list_documents_event(self, store):
        store.log("list_documents", namespace="proj")
        ev = store.get_events()["events"][0]
        assert ev["event_type"] == "list_documents"
        assert ev["namespace"] == "proj"

    def test_empty_namespace_stored_as_empty_string(self, store):
        store.log("list_documents")
        ev = store.get_events()["events"][0]
        assert ev["namespace"] == ""

    def test_multiple_logs_accumulate(self, store):
        for i in range(5):
            store.log("search", query=f"query {i}")
        assert store.get_events()["total"] == 5

    def test_nullable_fields_default_to_none(self, store):
        store.log("list_documents", namespace="ns")
        ev = store.get_events()["events"][0]
        assert ev["document_id"] is None
        assert ev["document_title"] is None
        assert ev["query"] is None
        assert ev["result_count"] is None


# ── get_events() ──


class TestGetEvents:
    def test_empty_store(self, store):
        result = store.get_events()
        assert result["total"] == 0
        assert result["events"] == []

    def test_limit(self, store):
        for i in range(10):
            store.log("search", query=f"q{i}")
        result = store.get_events(limit=3)
        assert len(result["events"]) == 3
        assert result["total"] == 10

    def test_offset_pagination(self, store):
        for i in range(6):
            store.log("search", query=f"q{i}")
        page1 = store.get_events(limit=3, offset=0)
        page2 = store.get_events(limit=3, offset=3)
        ids1 = {e["id"] for e in page1["events"]}
        ids2 = {e["id"] for e in page2["events"]}
        assert ids1.isdisjoint(ids2)

    def test_filter_by_event_type(self, store):
        store.log("search", query="hello")
        store.log("get_document", document_id="d1")
        store.log("list_documents")
        result = store.get_events(event_type="search")
        assert result["total"] == 1
        assert result["events"][0]["event_type"] == "search"

    def test_filter_by_namespace(self, store):
        store.log("search", namespace="ns-a", query="q1")
        store.log("search", namespace="ns-b", query="q2")
        store.log("search", namespace="ns-a", query="q3")
        result = store.get_events(namespace="ns-a")
        assert result["total"] == 2

    def test_ordered_by_timestamp_desc(self, store):
        store.log("search", query="first")
        store.log("search", query="second")
        result = store.get_events()
        assert result["events"][0]["query"] == "second"
        assert result["events"][1]["query"] == "first"

    def test_combine_event_type_and_namespace_filter(self, store):
        store.log("search", namespace="ns-a", query="q1")
        store.log("get_document", namespace="ns-a", document_id="d1")
        store.log("search", namespace="ns-b", query="q2")
        result = store.get_events(event_type="search", namespace="ns-a")
        assert result["total"] == 1
        assert result["events"][0]["query"] == "q1"


# ── get_stats() ──


class TestGetStats:
    def test_empty_store(self, store):
        stats = store.get_stats()
        assert stats["total_events"] == 0
        assert stats["events_by_type"] == {}
        assert stats["top_searches"] == []
        assert stats["top_documents"] == []
        assert stats["recent_events"] == []

    def test_total_events_count(self, store):
        store.log("search", query="a")
        store.log("search", query="b")
        store.log("get_document", document_id="d1")
        assert store.get_stats()["total_events"] == 3

    def test_events_by_type(self, store):
        store.log("search", query="a")
        store.log("search", query="b")
        store.log("get_document", document_id="d1")
        store.log("list_documents")
        stats = store.get_stats()
        assert stats["events_by_type"]["search"] == 2
        assert stats["events_by_type"]["get_document"] == 1
        assert stats["events_by_type"]["list_documents"] == 1

    def test_top_searches_ordered_by_count(self, store):
        for _ in range(3):
            store.log("search", query="popular")
        store.log("search", query="rare")
        stats = store.get_stats()
        assert stats["top_searches"][0]["query"] == "popular"
        assert stats["top_searches"][0]["count"] == 3
        assert stats["top_searches"][1]["query"] == "rare"
        assert stats["top_searches"][1]["count"] == 1

    def test_top_searches_max_10(self, store):
        for i in range(15):
            store.log("search", query=f"query-{i}")
        stats = store.get_stats()
        assert len(stats["top_searches"]) == 10

    def test_top_documents_ordered_by_count(self, store):
        for _ in range(4):
            store.log("get_document", document_id="doc-1", document_title="Popular Doc")
        store.log("get_document", document_id="doc-2", document_title="Rare Doc")
        stats = store.get_stats()
        assert stats["top_documents"][0]["document_id"] == "doc-1"
        assert stats["top_documents"][0]["document_title"] == "Popular Doc"
        assert stats["top_documents"][0]["count"] == 4

    def test_top_documents_max_10(self, store):
        for i in range(15):
            store.log("get_document", document_id=f"doc-{i}", document_title=f"Doc {i}")
        stats = store.get_stats()
        assert len(stats["top_documents"]) == 10

    def test_recent_events_max_20(self, store):
        for i in range(25):
            store.log("search", query=f"q{i}")
        stats = store.get_stats()
        assert len(stats["recent_events"]) == 20

    def test_recent_events_ordered_desc(self, store):
        store.log("search", query="first")
        store.log("search", query="last")
        stats = store.get_stats()
        assert stats["recent_events"][0]["query"] == "last"

    def test_namespace_filter_total(self, store):
        store.log("search", namespace="ns-a", query="q1")
        store.log("search", namespace="ns-b", query="q2")
        store.log("get_document", namespace="ns-a", document_id="d1")
        stats = store.get_stats(namespace="ns-a")
        assert stats["total_events"] == 2

    def test_namespace_filter_events_by_type(self, store):
        store.log("search", namespace="ns-a", query="q1")
        store.log("get_document", namespace="ns-a", document_id="d1")
        store.log("search", namespace="ns-b", query="q2")
        stats = store.get_stats(namespace="ns-a")
        assert stats["events_by_type"].get("search") == 1
        assert "ns-b" not in str(stats)

    def test_namespace_filter_top_searches(self, store):
        store.log("search", namespace="ns-a", query="q1")
        store.log("search", namespace="ns-b", query="q2")
        stats = store.get_stats(namespace="ns-a")
        assert len(stats["top_searches"]) == 1
        assert stats["top_searches"][0]["query"] == "q1"

    def test_namespace_filter_top_documents(self, store):
        store.log("get_document", namespace="ns-a", document_id="d1", document_title="A Doc")
        store.log("get_document", namespace="ns-b", document_id="d2", document_title="B Doc")
        stats = store.get_stats(namespace="ns-a")
        assert len(stats["top_documents"]) == 1
        assert stats["top_documents"][0]["document_id"] == "d1"

    def test_empty_namespace_filter(self, store):
        """namespace='' matches only events with no namespace."""
        store.log("search", namespace="", query="default")
        store.log("search", namespace="ns-a", query="scoped")
        stats = store.get_stats(namespace="")
        assert stats["total_events"] == 1
        assert stats["top_searches"][0]["query"] == "default"
