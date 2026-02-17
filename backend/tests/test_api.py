"""Tests for the FastAPI REST endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.api import app
from app.service import get_kb


@pytest.fixture(autouse=True)
def _use_tmp_db(monkeypatch, tmp_path):
    """Point all API requests to a temporary database."""
    monkeypatch.setenv("KB_DB_PATH", str(tmp_path / "test_api.db"))
    get_kb.cache_clear()
    yield
    get_kb.cache_clear()


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
