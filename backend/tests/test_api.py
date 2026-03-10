"""Tests for the FastAPI REST endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.analytics import reset_analytics
from app.service import get_kb


@pytest.fixture(autouse=True)
def _use_tmp_db(monkeypatch, tmp_path):
    """Point all API requests to temporary databases."""
    monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "test_api.db"))
    monkeypatch.setenv("KB_ANALYTICS_DB_PATH", str(tmp_path / "test_analytics.db"))
    get_kb.cache_clear()
    reset_analytics()
    yield
    get_kb.cache_clear()
    reset_analytics()


@pytest.fixture()
def client():
    return TestClient(app)


NS_HEADER = "X-Kb-Namespace"


# ── Health ──


class TestHealth:
    def test_health_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


# ── Namespaces ──


class TestNamespaces:
    def test_list_namespaces_empty(self, client):
        resp = client.get("/namespaces")
        assert resp.status_code == 200
        assert resp.json() == []


# ── Reload ──


class TestReload:
    def test_reload_returns_status(self, client):
        resp = client.post("/reload-db", headers={NS_HEADER: ""})
        assert resp.status_code == 200
        assert resp.json() == {"status": "reloaded"}


# ── Documents CRUD ──


class TestDocumentsCRUD:
    def test_list_documents_empty(self, client):
        resp = client.get("/documents", headers={NS_HEADER: ""})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_document(self, client):
        resp = client.post(
            "/documents",
            json={"title": "Test Doc", "content": "Hello world"},
            headers={NS_HEADER: ""},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Test Doc"
        assert data["content"] == "Hello world"
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_create_document_strips_title(self, client):
        resp = client.post(
            "/documents",
            json={"title": "  Padded Title  ", "content": ""},
            headers={NS_HEADER: ""},
        )
        assert resp.status_code == 201
        assert resp.json()["title"] == "Padded Title"

    def test_create_document_empty_title_rejected(self, client):
        resp = client.post(
            "/documents",
            json={"title": "", "content": "body"},
            headers={NS_HEADER: ""},
        )
        assert resp.status_code == 422

    def test_get_document(self, client):
        create_resp = client.post(
            "/documents",
            json={"title": "Fetch Me", "content": "Body"},
            headers={NS_HEADER: ""},
        )
        doc_id = create_resp.json()["id"]

        resp = client.get(f"/documents/{doc_id}", headers={NS_HEADER: ""})
        assert resp.status_code == 200
        assert resp.json()["title"] == "Fetch Me"

    def test_get_document_not_found(self, client):
        resp = client.get("/documents/nonexistent", headers={NS_HEADER: ""})
        assert resp.status_code == 404

    def test_update_document(self, client):
        create_resp = client.post(
            "/documents",
            json={"title": "Original", "content": "Old"},
            headers={NS_HEADER: ""},
        )
        doc_id = create_resp.json()["id"]

        resp = client.put(
            f"/documents/{doc_id}",
            json={"title": "Updated", "content": "New"},
            headers={NS_HEADER: ""},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Updated"
        assert data["content"] == "New"

    def test_update_document_not_found(self, client):
        resp = client.put(
            "/documents/nonexistent",
            json={"title": "X", "content": "Y"},
            headers={NS_HEADER: ""},
        )
        assert resp.status_code == 404

    def test_delete_document(self, client):
        create_resp = client.post(
            "/documents",
            json={"title": "Delete Me", "content": ""},
            headers={NS_HEADER: ""},
        )
        doc_id = create_resp.json()["id"]

        resp = client.delete(f"/documents/{doc_id}", headers={NS_HEADER: ""})
        assert resp.status_code == 204

        # Verify it's gone
        resp = client.get(f"/documents/{doc_id}", headers={NS_HEADER: ""})
        assert resp.status_code == 404

    def test_delete_document_not_found(self, client):
        resp = client.delete("/documents/nonexistent", headers={NS_HEADER: ""})
        assert resp.status_code == 404

    def test_list_documents_returns_created_docs(self, client):
        client.post(
            "/documents",
            json={"title": "Doc A", "content": ""},
            headers={NS_HEADER: ""},
        )
        client.post(
            "/documents",
            json={"title": "Doc B", "content": ""},
            headers={NS_HEADER: ""},
        )
        resp = client.get("/documents", headers={NS_HEADER: ""})
        assert resp.status_code == 200
        assert len(resp.json()) == 2


# ── Verify Document ──


class TestVerifyDocument:
    def test_verify_document_returns_updated_doc(self, client):
        create_resp = client.post(
            "/documents",
            json={"title": "Verify Me", "content": "Body"},
            headers={NS_HEADER: ""},
        )
        doc_id = create_resp.json()["id"]

        resp = client.post(f"/documents/{doc_id}/verify", headers={NS_HEADER: ""})
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Verify Me"
        assert data["content"] == "Body"
        assert "verified_at" in data

    def test_verify_document_not_found(self, client):
        resp = client.post("/documents/nonexistent/verify", headers={NS_HEADER: ""})
        assert resp.status_code == 404

    def test_verify_does_not_change_content(self, client):
        create_resp = client.post(
            "/documents",
            json={"title": "Stable", "content": "Original content"},
            headers={NS_HEADER: ""},
        )
        doc_id = create_resp.json()["id"]

        client.post(f"/documents/{doc_id}/verify", headers={NS_HEADER: ""})
        get_resp = client.get(f"/documents/{doc_id}", headers={NS_HEADER: ""})
        assert get_resp.json()["title"] == "Stable"
        assert get_resp.json()["content"] == "Original content"


# ── Stale Documents ──


class TestStaleDocuments:
    def test_get_stale_documents_empty(self, client):
        resp = client.get("/stale-documents", headers={NS_HEADER: ""})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_stale_documents_with_threshold(self, client):
        # Create a doc, then it's fresh so shouldn't appear
        client.post(
            "/documents",
            json={"title": "Fresh Doc", "content": ""},
            headers={NS_HEADER: ""},
        )
        resp = client.get("/stale-documents?days_threshold=30", headers={NS_HEADER: ""})
        assert resp.status_code == 200
        assert len(resp.json()) == 0


# ── Document response includes verified_at ──


class TestDocumentVerifiedAtField:
    def test_created_document_has_verified_at(self, client):
        resp = client.post(
            "/documents",
            json={"title": "Test", "content": "Body"},
            headers={NS_HEADER: ""},
        )
        assert resp.status_code == 201
        assert "verified_at" in resp.json()

    def test_get_document_has_verified_at(self, client):
        create_resp = client.post(
            "/documents",
            json={"title": "Test", "content": "Body"},
            headers={NS_HEADER: ""},
        )
        doc_id = create_resp.json()["id"]
        resp = client.get(f"/documents/{doc_id}", headers={NS_HEADER: ""})
        assert "verified_at" in resp.json()

    def test_list_documents_has_verified_at(self, client):
        client.post(
            "/documents",
            json={"title": "Test", "content": "Body"},
            headers={NS_HEADER: ""},
        )
        resp = client.get("/documents", headers={NS_HEADER: ""})
        assert "verified_at" in resp.json()[0]

    def test_search_results_include_days_since_verified(self, client):
        client.post(
            "/documents",
            json={"title": "Python Guide", "content": "Learn Python"},
            headers={NS_HEADER: ""},
        )
        resp = client.post(
            "/search",
            json={"query": "python"},
            headers={NS_HEADER: ""},
        )
        results = resp.json()
        assert len(results) > 0
        assert "days_since_verified" in results[0]


# ── Search ──


class TestSearch:
    def test_search_returns_results(self, client):
        client.post(
            "/documents",
            json={"title": "Python Guide", "content": "Learn Python programming"},
            headers={NS_HEADER: ""},
        )
        resp = client.post(
            "/search",
            json={"query": "python", "limit": 5},
            headers={NS_HEADER: ""},
        )
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) > 0
        assert results[0]["title"] == "Python Guide"

    def test_search_empty_query_rejected(self, client):
        resp = client.post(
            "/search",
            json={"query": "", "limit": 5},
            headers={NS_HEADER: ""},
        )
        assert resp.status_code == 422

    def test_search_limit_validation(self, client):
        resp = client.post(
            "/search",
            json={"query": "test", "limit": 0},
            headers={NS_HEADER: ""},
        )
        assert resp.status_code == 422

        resp = client.post(
            "/search",
            json={"query": "test", "limit": 51},
            headers={NS_HEADER: ""},
        )
        assert resp.status_code == 422

    def test_search_result_fields(self, client):
        client.post(
            "/documents",
            json={"title": "Test", "content": "Content for testing"},
            headers={NS_HEADER: ""},
        )
        resp = client.post(
            "/search",
            json={"query": "test"},
            headers={NS_HEADER: ""},
        )
        results = resp.json()
        assert len(results) > 0
        result = results[0]
        assert "id" in result
        assert "title" in result
        assert "content_preview" in result
        assert "score" in result


# ── Namespace isolation ──


class TestNamespaceIsolation:
    def test_documents_isolated_by_namespace(self, client):
        client.post(
            "/documents",
            json={"title": "NS-A Doc", "content": ""},
            headers={NS_HEADER: "ns-a"},
        )
        client.post(
            "/documents",
            json={"title": "NS-B Doc", "content": ""},
            headers={NS_HEADER: "ns-b"},
        )

        resp_a = client.get("/documents", headers={NS_HEADER: "ns-a"})
        resp_b = client.get("/documents", headers={NS_HEADER: "ns-b"})

        assert len(resp_a.json()) == 1
        assert resp_a.json()[0]["title"] == "NS-A Doc"
        assert len(resp_b.json()) == 1
        assert resp_b.json()[0]["title"] == "NS-B Doc"

    def test_default_namespace_separate_from_named(self, client):
        client.post(
            "/documents",
            json={"title": "Default Doc", "content": ""},
            headers={NS_HEADER: ""},
        )
        resp = client.get("/documents", headers={NS_HEADER: "isolated"})
        assert len(resp.json()) == 0


# ── Analytics ──


MCP_HEADER = {"X-Lore-Source": "mcp"}


class TestAnalyticsLogEvent:
    def test_post_event_returns_201(self, client):
        resp = client.post(
            "/analytics/events",
            json={"event_type": "search", "namespace": "", "query": "python"},
        )
        assert resp.status_code == 201

    def test_post_event_returns_event_fields(self, client):
        resp = client.post(
            "/analytics/events",
            json={"event_type": "get_document", "namespace": "ns1", "document_id": "d1", "document_title": "A Doc"},
        )
        data = resp.json()
        assert data["event_type"] == "get_document"
        assert data["document_id"] == "d1"
        assert "id" in data
        assert "timestamp" in data

    def test_post_event_minimal_payload(self, client):
        resp = client.post("/analytics/events", json={"event_type": "list_documents"})
        assert resp.status_code == 201

    def test_post_event_invalid_event_type_rejected(self, client):
        resp = client.post("/analytics/events", json={"event_type": ""})
        assert resp.status_code == 422


class TestAnalyticsStats:
    def test_stats_empty(self, client):
        resp = client.get("/analytics/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_events"] == 0
        assert data["events_by_type"] == {}
        assert data["top_searches"] == []
        assert data["top_documents"] == []
        assert data["recent_events"] == []

    def test_stats_reflect_logged_events(self, client):
        client.post("/analytics/events", json={"event_type": "search", "query": "python", "result_count": 3})
        client.post("/analytics/events", json={"event_type": "search", "query": "python"})
        client.post("/analytics/events", json={"event_type": "get_document", "document_id": "d1", "document_title": "Guide"})
        resp = client.get("/analytics/stats")
        data = resp.json()
        assert data["total_events"] == 3
        assert data["events_by_type"]["search"] == 2
        assert data["top_searches"][0]["query"] == "python"
        assert data["top_searches"][0]["count"] == 2
        assert data["top_documents"][0]["document_id"] == "d1"

    def test_stats_namespace_filter(self, client):
        client.post("/analytics/events", json={"event_type": "search", "namespace": "ns-a", "query": "q1"})
        client.post("/analytics/events", json={"event_type": "search", "namespace": "ns-b", "query": "q2"})
        resp = client.get("/analytics/stats?namespace=ns-a")
        data = resp.json()
        assert data["total_events"] == 1
        assert data["top_searches"][0]["query"] == "q1"


class TestAnalyticsEvents:
    def test_get_events_empty(self, client):
        resp = client.get("/analytics/events")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["events"] == []

    def test_get_events_returns_logged_events(self, client):
        client.post("/analytics/events", json={"event_type": "search", "query": "hello"})
        client.post("/analytics/events", json={"event_type": "list_documents"})
        resp = client.get("/analytics/events")
        data = resp.json()
        assert data["total"] == 2

    def test_get_events_limit_and_offset(self, client):
        for i in range(5):
            client.post("/analytics/events", json={"event_type": "search", "query": f"q{i}"})
        resp = client.get("/analytics/events?limit=2&offset=0")
        data = resp.json()
        assert data["total"] == 5
        assert len(data["events"]) == 2

    def test_get_events_filter_by_event_type(self, client):
        client.post("/analytics/events", json={"event_type": "search", "query": "test"})
        client.post("/analytics/events", json={"event_type": "get_document", "document_id": "d1"})
        resp = client.get("/analytics/events?event_type=search")
        data = resp.json()
        assert data["total"] == 1
        assert data["events"][0]["event_type"] == "search"

    def test_get_events_filter_by_namespace(self, client):
        client.post("/analytics/events", json={"event_type": "search", "namespace": "ns-a", "query": "q1"})
        client.post("/analytics/events", json={"event_type": "search", "namespace": "ns-b", "query": "q2"})
        resp = client.get("/analytics/events?namespace=ns-a")
        data = resp.json()
        assert data["total"] == 1


# ── Export ──


class TestExport:
    def test_export_empty_namespace(self, client):
        resp = client.get("/export", headers={NS_HEADER: "empty-ns"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == 1
        assert data["documents"] == []

    def test_export_returns_all_documents(self, client):
        client.post("/documents", json={"title": "Alpha", "content": "a"}, headers={NS_HEADER: "export-ns"})
        client.post("/documents", json={"title": "Beta", "content": "b"}, headers={NS_HEADER: "export-ns"})
        resp = client.get("/export", headers={NS_HEADER: "export-ns"})
        assert resp.status_code == 200
        data = resp.json()
        titles = {doc["title"] for doc in data["documents"]}
        assert titles == {"Alpha", "Beta"}

    def test_export_has_correct_content_disposition(self, client):
        resp = client.get("/export", headers={NS_HEADER: "my-ns"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["namespace"] == "my-ns"
        assert "exported_at" in data
        assert "version" in data


# ── Import ──


class TestImport:
    def test_import_merge_adds_documents(self, client):
        client.post("/documents", json={"title": "Existing", "content": "x"}, headers={NS_HEADER: "merge-ns"})
        resp = client.post(
            "/import",
            json={"documents": [{"title": "New A", "content": ""}, {"title": "New B", "content": ""}], "mode": "merge"},
            headers={NS_HEADER: "merge-ns"},
        )
        assert resp.status_code == 200
        assert resp.json()["imported"] == 2
        all_docs = client.get("/documents", headers={NS_HEADER: "merge-ns"}).json()
        assert len(all_docs) == 3

    def test_import_replace_clears_first(self, client):
        client.post("/documents", json={"title": "Old", "content": "x"}, headers={NS_HEADER: "replace-ns"})
        resp = client.post(
            "/import",
            json={"documents": [{"title": "New A", "content": ""}, {"title": "New B", "content": ""}], "mode": "replace"},
            headers={NS_HEADER: "replace-ns"},
        )
        assert resp.status_code == 200
        assert resp.json()["imported"] == 2
        all_docs = client.get("/documents", headers={NS_HEADER: "replace-ns"}).json()
        assert len(all_docs) == 2
        titles = {d["title"] for d in all_docs}
        assert "Old" not in titles

    def test_import_invalid_mode_rejected(self, client):
        resp = client.post(
            "/import",
            json={"documents": [], "mode": "overwrite"},
            headers={NS_HEADER: ""},
        )
        assert resp.status_code == 422

    def test_import_empty_title_rejected(self, client):
        resp = client.post(
            "/import",
            json={"documents": [{"title": "", "content": "body"}], "mode": "merge"},
            headers={NS_HEADER: ""},
        )
        assert resp.status_code == 422

    def test_import_roundtrip(self, client):
        client.post("/documents", json={"title": "Round A", "content": "aaa"}, headers={NS_HEADER: "src-ns"})
        client.post("/documents", json={"title": "Round B", "content": "bbb"}, headers={NS_HEADER: "src-ns"})
        export_data = client.get("/export", headers={NS_HEADER: "src-ns"}).json()
        client.post(
            "/import",
            json={"documents": export_data["documents"], "mode": "replace"},
            headers={NS_HEADER: "dest-ns"},
        )
        dest_docs = client.get("/documents", headers={NS_HEADER: "dest-ns"}).json()
        assert len(dest_docs) == 2
        dest_titles = {d["title"] for d in dest_docs}
        assert dest_titles == {"Round A", "Round B"}
