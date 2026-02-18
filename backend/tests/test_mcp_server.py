"""Tests for MCP server HTTP transport support."""

import os
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def _reset_namespace_ctx():
    """Reset the namespace context var to a clean state between tests."""
    import app.mcp_server as mod

    token = mod._namespace_ctx.set(None)
    yield
    mod._namespace_ctx.reset(token)


class TestMCPServerModule:
    """Verify the MCP server module is correctly set up."""

    def test_mcp_instance_is_fastmcp(self):
        from mcp.server.fastmcp import FastMCP

        from app.mcp_server import mcp

        assert isinstance(mcp, FastMCP)

    def test_mcp_server_name(self):
        from app.mcp_server import mcp

        assert mcp.name == "vector-knowledge-base"


class TestMCPTransport:
    """Verify that MCP_TRANSPORT env var controls the transport mode."""

    def test_default_transport_is_stdio(self, monkeypatch):
        """Without MCP_TRANSPORT env var, transport defaults to stdio."""
        monkeypatch.delenv("MCP_TRANSPORT", raising=False)
        transport = os.getenv("MCP_TRANSPORT", "stdio")
        assert transport == "stdio"

    def test_sse_transport_from_env(self, monkeypatch):
        """Setting MCP_TRANSPORT=sse selects SSE transport."""
        monkeypatch.setenv("MCP_TRANSPORT", "sse")
        transport = os.getenv("MCP_TRANSPORT", "stdio")
        assert transport == "sse"

    def test_streamable_http_transport_from_env(self, monkeypatch):
        """Setting MCP_TRANSPORT=streamable-http selects streamable-http transport."""
        monkeypatch.setenv("MCP_TRANSPORT", "streamable-http")
        transport = os.getenv("MCP_TRANSPORT", "stdio")
        assert transport == "streamable-http"

    def test_run_uses_transport_env_var(self, monkeypatch):
        """mcp.run() is called with the transport from MCP_TRANSPORT env var."""
        monkeypatch.setenv("MCP_TRANSPORT", "sse")
        from app.mcp_server import mcp

        with patch.object(mcp, "run") as mock_run:
            transport = os.getenv("MCP_TRANSPORT", "stdio")
            mcp.run(transport=transport)

        mock_run.assert_called_once_with(transport="sse")

    def test_run_defaults_to_stdio_without_env(self, monkeypatch):
        """mcp.run() defaults to stdio when MCP_TRANSPORT is unset."""
        monkeypatch.delenv("MCP_TRANSPORT", raising=False)
        from app.mcp_server import mcp

        with patch.object(mcp, "run") as mock_run:
            transport = os.getenv("MCP_TRANSPORT", "stdio")
            mcp.run(transport=transport)

        mock_run.assert_called_once_with(transport="stdio")


class TestBuildSSEApp:
    """Tests for build_sse_app(), which mounts the SSE app under a configurable prefix."""

    def test_returns_starlette_app(self):
        from starlette.applications import Starlette

        import app.mcp_server as mod

        built = mod.build_sse_app("/mcp")
        assert isinstance(built, Starlette)

    def test_mounts_at_given_path(self):
        from starlette.routing import Mount

        import app.mcp_server as mod

        built = mod.build_sse_app("/mcp")
        assert any(isinstance(r, Mount) and r.path == "/mcp" for r in built.routes)

    def test_default_mount_path_is_mcp(self):
        from starlette.routing import Mount

        import app.mcp_server as mod

        built = mod.build_sse_app()
        assert any(isinstance(r, Mount) and r.path == "/mcp" for r in built.routes)

    def test_inner_app_is_namespace_middleware(self):
        from starlette.routing import Mount

        import app.mcp_server as mod

        built = mod.build_sse_app("/mcp")
        mounts = [r for r in built.routes if isinstance(r, Mount) and r.path == "/mcp"]
        assert len(mounts) == 1
        assert isinstance(mounts[0].app, mod._NamespaceMiddleware)

    def test_custom_mount_path(self):
        from starlette.routing import Mount

        import app.mcp_server as mod

        built = mod.build_sse_app("/tools/mcp")
        assert any(isinstance(r, Mount) and r.path == "/tools/mcp" for r in built.routes)


class TestMCPSSEApp:
    """Verify the SSE ASGI application can be created."""

    def test_sse_app_can_be_created(self):
        """FastMCP exposes an SSE ASGI application."""
        from app.mcp_server import mcp

        sse_app = mcp.sse_app()
        assert sse_app is not None

    def test_sse_app_is_asgi_callable(self):
        """The SSE app returned is an ASGI-compatible callable."""
        from app.mcp_server import mcp

        sse_app = mcp.sse_app()
        assert callable(sse_app)

    def test_sse_app_exposes_sse_route(self):
        """The SSE app registers an /sse route."""
        from app.mcp_server import mcp

        sse_app = mcp.sse_app()
        route_paths = [str(getattr(r, "path", "")) for r in sse_app.routes]
        assert any("/sse" in p for p in route_paths)


class TestMCPStateless:
    """Verify the mcp instance is configured for stateless HTTP."""

    def test_mcp_is_stateless_http(self):
        """mcp must be configured with stateless_http=True so service restarts
        don't invalidate in-flight sessions."""
        from app.mcp_server import mcp

        assert mcp.settings.stateless_http is True


class TestBuildStreamableHttpApp:
    """Tests for build_streamable_http_app(), which mounts the streamable-http
    app under a configurable prefix."""

    def test_returns_starlette_app(self):
        from starlette.applications import Starlette

        import app.mcp_server as mod

        built = mod.build_streamable_http_app("/mcp")
        assert isinstance(built, Starlette)

    def test_mounts_at_given_path(self):
        from starlette.routing import Mount

        import app.mcp_server as mod

        built = mod.build_streamable_http_app("/mcp")
        assert any(isinstance(r, Mount) and r.path == "/mcp" for r in built.routes)

    def test_default_mount_path_is_mcp(self):
        from starlette.routing import Mount

        import app.mcp_server as mod

        built = mod.build_streamable_http_app()
        assert any(isinstance(r, Mount) and r.path == "/mcp" for r in built.routes)

    def test_inner_app_is_namespace_middleware(self):
        from starlette.routing import Mount

        import app.mcp_server as mod

        built = mod.build_streamable_http_app("/mcp")
        mounts = [r for r in built.routes if isinstance(r, Mount) and r.path == "/mcp"]
        assert len(mounts) == 1
        assert isinstance(mounts[0].app, mod._NamespaceMiddleware)

    def test_custom_mount_path(self):
        from starlette.routing import Mount

        import app.mcp_server as mod

        built = mod.build_streamable_http_app("/tools/mcp")
        assert any(isinstance(r, Mount) and r.path == "/tools/mcp" for r in built.routes)


class TestMCPStreamableHttpApp:
    """Verify the streamable-http ASGI application can be created."""

    def test_streamable_http_app_can_be_created(self):
        """FastMCP exposes a streamable-http ASGI application."""
        from app.mcp_server import mcp

        app = mcp.streamable_http_app()
        assert app is not None

    def test_streamable_http_app_is_asgi_callable(self):
        """The streamable-http app returned is an ASGI-compatible callable."""
        from app.mcp_server import mcp

        app = mcp.streamable_http_app()
        assert callable(app)

    def test_streamable_http_app_serves_at_root(self):
        """With streamable_http_path='/', the app has a route at '/' so it
        serves cleanly under a Starlette Mount without a double path segment."""
        from starlette.routing import Route

        from app.mcp_server import mcp

        http_app = mcp.streamable_http_app()
        route_paths = [str(getattr(r, "path", "")) for r in http_app.routes]
        assert "/" in route_paths

    def test_namespace_middleware_wraps_streamable_http_app(self):
        """_NamespaceMiddleware can wrap the FastMCP streamable-http app."""
        import app.mcp_server as mod

        wrapped = mod._NamespaceMiddleware(mod.mcp.streamable_http_app())
        assert isinstance(wrapped, mod._NamespaceMiddleware)


class TestNamespaceContext:
    """Tests for per-request namespace resolution via context variable."""

    def test_get_namespace_falls_back_to_env_var(self, monkeypatch):
        """When context var is unset (None), falls back to KB_NAMESPACE env var."""
        monkeypatch.setenv("KB_NAMESPACE", "env-ns")
        import app.mcp_server as mod

        # _namespace_ctx is reset to None by the autouse fixture
        assert mod._get_namespace() == "env-ns"

    def test_get_namespace_uses_context_var_when_set(self):
        """When context var is set, _get_namespace returns the context value."""
        import app.mcp_server as mod

        token = mod._namespace_ctx.set("ctx-ns")
        try:
            assert mod._get_namespace() == "ctx-ns"
        finally:
            mod._namespace_ctx.reset(token)

    def test_context_var_overrides_env_var(self, monkeypatch):
        """Context var takes precedence over KB_NAMESPACE env var."""
        monkeypatch.setenv("KB_NAMESPACE", "env-ns")
        import app.mcp_server as mod

        token = mod._namespace_ctx.set("ctx-ns")
        try:
            assert mod._get_namespace() == "ctx-ns"
        finally:
            mod._namespace_ctx.reset(token)

    def test_empty_string_context_var_uses_env_fallback(self, monkeypatch):
        """An explicitly empty context var still falls back to the env var."""
        monkeypatch.setenv("KB_NAMESPACE", "env-ns")
        import app.mcp_server as mod

        token = mod._namespace_ctx.set("")
        try:
            assert mod._get_namespace() == "env-ns"
        finally:
            mod._namespace_ctx.reset(token)

    def test_get_namespace_returns_empty_string_when_nothing_set(self, monkeypatch):
        """Returns empty string when neither context var nor env var is set."""
        monkeypatch.delenv("KB_NAMESPACE", raising=False)
        import app.mcp_server as mod

        assert mod._get_namespace() == ""


class TestNamespaceMiddleware:
    """Tests for the ASGI middleware that extracts X-KB-Namespace headers."""

    def test_middleware_sets_namespace_from_header(self):
        """The middleware extracts X-KB-Namespace and sets the context var."""
        from starlette.applications import Starlette
        from starlette.requests import Request
        from starlette.responses import PlainTextResponse
        from starlette.routing import Route
        from starlette.testclient import TestClient

        import app.mcp_server as mod

        captured = {}

        async def handler(request: Request):
            captured["ns"] = mod._get_namespace()
            return PlainTextResponse("ok")

        app = mod._NamespaceMiddleware(Starlette(routes=[Route("/test", handler)]))
        TestClient(app).get("/test", headers={"X-KB-Namespace": "header-ns"})
        assert captured["ns"] == "header-ns"

    def test_middleware_falls_back_to_env_when_no_header(self, monkeypatch):
        """Without the header the middleware leaves context unset so env var applies."""
        monkeypatch.setenv("KB_NAMESPACE", "env-ns")
        from starlette.applications import Starlette
        from starlette.requests import Request
        from starlette.responses import PlainTextResponse
        from starlette.routing import Route
        from starlette.testclient import TestClient

        import app.mcp_server as mod

        captured = {}

        async def handler(request: Request):
            captured["ns"] = mod._get_namespace()
            return PlainTextResponse("ok")

        app = mod._NamespaceMiddleware(Starlette(routes=[Route("/test", handler)]))
        TestClient(app).get("/test")
        assert captured["ns"] == "env-ns"

    def test_middleware_wraps_sse_app(self):
        """_NamespaceMiddleware can wrap the FastMCP SSE app."""
        import app.mcp_server as mod

        wrapped = mod._NamespaceMiddleware(mod.mcp.sse_app())
        assert isinstance(wrapped, mod._NamespaceMiddleware)


class TestMCPEventLogging:
    """MCP tools fire-and-forget analytics events after each operation."""

    def test_search_documents_logs_event_via_api(self, monkeypatch):
        """search_documents posts a search event when using the API proxy."""
        import app.mcp_server as mod

        calls = []

        def fake_api_request(method, path, payload=None):
            calls.append((method, path, payload))
            if path == "/search":
                return [{"id": "d1", "title": "Doc", "content_preview": "...", "score": 0.9}]
            return None

        monkeypatch.setattr(mod, "API_BASE", "http://backend:8000")
        monkeypatch.setattr(mod, "_api_request", fake_api_request)
        mod.search_documents(query="python test", limit=5)

        analytics_calls = [c for c in calls if c[1] == "/analytics/events"]
        assert len(analytics_calls) == 1
        payload = analytics_calls[0][2]
        assert payload["event_type"] == "search"
        assert payload["query"] == "python test"
        assert payload["result_count"] == 1

    def test_get_document_logs_event_via_api(self, monkeypatch):
        """get_document posts a get_document event when using the API proxy."""
        import app.mcp_server as mod

        calls = []

        def fake_api_request(method, path, payload=None):
            calls.append((method, path, payload))
            if "/documents/" in path:
                return {"id": "doc-1", "title": "Python Guide", "content": "..."}
            return None

        monkeypatch.setattr(mod, "API_BASE", "http://backend:8000")
        monkeypatch.setattr(mod, "_api_request", fake_api_request)
        mod.get_document(document_id="doc-1")

        analytics_calls = [c for c in calls if c[1] == "/analytics/events"]
        assert len(analytics_calls) == 1
        payload = analytics_calls[0][2]
        assert payload["event_type"] == "get_document"
        assert payload["document_id"] == "doc-1"
        assert payload["document_title"] == "Python Guide"

    def test_list_documents_logs_event_via_api(self, monkeypatch):
        """list_documents posts a list_documents event when using the API proxy."""
        import app.mcp_server as mod

        calls = []

        def fake_api_request(method, path, payload=None):
            calls.append((method, path, payload))
            if path == "/documents":
                return []
            return None

        monkeypatch.setattr(mod, "API_BASE", "http://backend:8000")
        monkeypatch.setattr(mod, "_api_request", fake_api_request)
        mod.list_documents()

        analytics_calls = [c for c in calls if c[1] == "/analytics/events"]
        assert len(analytics_calls) == 1
        assert analytics_calls[0][2]["event_type"] == "list_documents"

    def test_analytics_failure_does_not_break_tool(self, monkeypatch):
        """If the analytics POST fails, the tool still returns its result."""
        import app.mcp_server as mod

        def fake_api_request(method, path, payload=None):
            if path == "/analytics/events":
                raise RuntimeError("analytics down")
            if path == "/search":
                return []
            return None

        monkeypatch.setattr(mod, "API_BASE", "http://backend:8000")
        monkeypatch.setattr(mod, "_api_request", fake_api_request)
        result = mod.search_documents(query="test")
        assert result["ok"] is True

    def test_search_logs_include_namespace(self, monkeypatch):
        """Analytics event includes the active namespace."""
        import app.mcp_server as mod

        calls = []

        def fake_api_request(method, path, payload=None):
            calls.append((method, path, payload))
            if path == "/search":
                return []
            return None

        monkeypatch.setattr(mod, "API_BASE", "http://backend:8000")
        monkeypatch.setattr(mod, "_api_request", fake_api_request)

        token = mod._namespace_ctx.set("lore-db")
        try:
            mod.search_documents(query="test")
        finally:
            mod._namespace_ctx.reset(token)

        analytics_calls = [c for c in calls if c[1] == "/analytics/events"]
        assert analytics_calls[0][2]["namespace"] == "lore-db"
