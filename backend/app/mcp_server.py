import contextvars
import json
import os
from urllib import error, parse, request

from mcp.server.fastmcp import FastMCP

from .service import get_kb

mcp = FastMCP("vector-knowledge-base", stateless_http=True, streamable_http_path="/")
API_BASE = os.getenv("KB_API_BASE", "").rstrip("/")

# Per-request namespace resolved from the X-KB-Namespace header (SSE transport)
# or from the KB_NAMESPACE env var (stdio transport / fallback).
_namespace_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "namespace", default=None
)


def _get_namespace() -> str:
    """Return the active namespace, preferring the per-request context var."""
    ctx = _namespace_ctx.get()
    if ctx:  # None or "" → fall back to env var
        return ctx
    return os.getenv("KB_NAMESPACE", "")


class _NamespaceMiddleware:
    """ASGI middleware that reads X-KB-Namespace from every HTTP request
    and stores it in _namespace_ctx so tool functions can access it."""

    def __init__(self, app):
        self._app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            headers = dict(scope.get("headers", []))
            ns = headers.get(b"x-kb-namespace", b"").decode()
            _namespace_ctx.set(ns or None)
        await self._app(scope, receive, send)


def _has_api_proxy() -> bool:
    return bool(API_BASE)


def _api_request(
    method: str, path: str, payload: dict | None = None
) -> dict | list | None:
    if not _has_api_proxy():
        raise RuntimeError("KB_API_BASE is not configured.")

    url = f"{API_BASE}{path}"
    body = None
    headers: dict[str, str] = {}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    ns = _get_namespace()
    if ns:
        headers["X-KB-Namespace"] = ns
    req = request.Request(url=url, data=body, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=10) as response:
            raw = response.read()
            if not raw:
                return None
            return json.loads(raw.decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} from API: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Could not reach API at {API_BASE}: {exc.reason}") from exc


def _log_event(event_type: str, **kwargs) -> None:
    """Fire-and-forget analytics event. Never raises."""
    try:
        ns = _get_namespace()
        payload = {"event_type": event_type, "namespace": ns, **kwargs}
        if _has_api_proxy():
            _api_request("POST", "/analytics/events", payload)
        else:
            from .analytics import get_analytics
            get_analytics().log(event_type=event_type, namespace=ns, **kwargs)
    except Exception:
        pass


@mcp.tool()
def list_documents() -> list[dict]:
    """List documents in the knowledge base."""
    if _has_api_proxy():
        data = _api_request("GET", "/documents")
        result = data if isinstance(data, list) else []
        _log_event("list_documents")
        return result
    docs = get_kb(_get_namespace()).list_documents()
    _log_event("list_documents")
    return docs


@mcp.tool()
def get_document(document_id: str) -> dict:
    """Get one document by id."""
    if _has_api_proxy():
        safe_id = parse.quote(document_id, safe="")
        data = _api_request("GET", f"/documents/{safe_id}")
        title = data.get("title") if isinstance(data, dict) else None
        _log_event("get_document", document_id=document_id, document_title=title)
        return {"ok": True, "document": data}

    document = get_kb(_get_namespace()).get_document(document_id)
    if document is None:
        return {"ok": False, "error": "Document not found", "document_id": document_id}
    _log_event("get_document", document_id=document_id, document_title=document.get("title"))
    return {"ok": True, "document": document}


@mcp.tool()
def create_document(title: str, content: str = "") -> dict:
    """Create a new document."""
    if _has_api_proxy():
        document = _api_request(
            "POST", "/documents", {"title": title.strip(), "content": content}
        )
        _log_event("create_document")
        return {"ok": True, "document": document}

    document = get_kb(_get_namespace()).create_document(title=title.strip(), content=content)
    _log_event("create_document")
    return {"ok": True, "document": document}


@mcp.tool()
def update_document(
    document_id: str,
    title: str | None = None,
    content: str | None = None,
) -> dict:
    """Update an existing document. Missing fields keep current values."""
    if _has_api_proxy():
        safe_id = parse.quote(document_id, safe="")
        current = _api_request("GET", f"/documents/{safe_id}")
        if not isinstance(current, dict):
            return {
                "ok": False,
                "error": "Document not found",
                "document_id": document_id,
            }

        next_title = title.strip() if title is not None else current.get("title", "")
        next_content = content if content is not None else current.get("content", "")
        updated = _api_request(
            "PUT",
            f"/documents/{safe_id}",
            {"title": next_title, "content": next_content},
        )
        _log_event("update_document", document_id=document_id)
        return {"ok": True, "document": updated}

    current = get_kb(_get_namespace()).get_document(document_id)
    if current is None:
        return {"ok": False, "error": "Document not found", "document_id": document_id}

    next_title = title.strip() if title is not None else current["title"]
    next_content = content if content is not None else current["content"]
    updated = get_kb(_get_namespace()).update_document(
        document_id=document_id,
        title=next_title,
        content=next_content,
    )
    _log_event("update_document", document_id=document_id)
    return {"ok": True, "document": updated}


@mcp.tool()
def delete_document(document_id: str) -> dict:
    """Delete a document by id."""
    if _has_api_proxy():
        safe_id = parse.quote(document_id, safe="")
        _api_request("DELETE", f"/documents/{safe_id}")
        _log_event("delete_document", document_id=document_id)
        return {"ok": True, "document_id": document_id}

    deleted = get_kb(_get_namespace()).delete_document(document_id=document_id)
    if not deleted:
        return {"ok": False, "error": "Document not found", "document_id": document_id}
    _log_event("delete_document", document_id=document_id)
    return {"ok": True, "document_id": document_id}


@mcp.tool()
def search_documents(query: str, limit: int = 5) -> dict:
    """Vector-search documents by free-text query."""
    safe_limit = min(max(limit, 1), 50)
    if _has_api_proxy():
        results = _api_request("POST", "/search", {"query": query, "limit": safe_limit})
        result_list = results if isinstance(results, list) else []
        _log_event("search", query=query, result_count=len(result_list))
        return {"ok": True, "query": query, "results": result_list}

    results = get_kb(_get_namespace()).search(query=query, limit=safe_limit)
    _log_event("search", query=query, result_count=len(results))
    return {"ok": True, "query": query, "results": results}


def build_sse_app(mount_path: str = "/mcp"):
    """Return a Starlette app with the MCP SSE app mounted at *mount_path*.

    Mounting via Starlette's Mount propagates the correct ASGI root_path into
    the inner SSE app so it advertises ``<mount_path>/messages/`` as the
    messages endpoint — matching what the reverse proxy exposes externally.
    """
    from starlette.applications import Starlette
    from starlette.routing import Mount

    return Starlette(routes=[Mount(mount_path, app=_NamespaceMiddleware(mcp.sse_app()))])


def build_streamable_http_app(mount_path: str = "/mcp"):
    """Return a Starlette app with the MCP streamable-http app mounted at *mount_path*.

    The mcp instance is configured with ``streamable_http_path="/"`` so the
    inner app's single route lives at ``/``.  Mounting it at *mount_path* makes
    the public endpoint ``<mount_path>/`` — a single clean URL with no double
    path segments.  Because the transport is stateless (``stateless_http=True``)
    each request is self-contained and service restarts never invalidate sessions.

    The session manager's task group is started via the outer Starlette lifespan.
    Starlette does not propagate lifespans from mounted sub-apps, so we wire it
    up explicitly here after ``streamable_http_app()`` has initialised the manager.
    """
    from contextlib import asynccontextmanager

    from starlette.applications import Starlette
    from starlette.routing import Mount

    http_app = mcp.streamable_http_app()  # initialises mcp._session_manager

    @asynccontextmanager
    async def _lifespan(_):
        async with mcp._session_manager.run():
            yield

    return Starlette(
        routes=[Mount(mount_path, app=_NamespaceMiddleware(http_app))],
        lifespan=_lifespan,
    )


if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "stdio")
    if transport in ("sse", "streamable-http"):
        import uvicorn

        host = os.getenv("FASTMCP_HOST", "127.0.0.1")
        port = int(os.getenv("FASTMCP_PORT", "8000"))
        mount_path = os.getenv("MCP_MOUNT_PATH", "/mcp")
        if transport == "sse":
            uvicorn.run(build_sse_app(mount_path), host=host, port=port)
        else:
            uvicorn.run(build_streamable_http_app(mount_path), host=host, port=port)
    else:
        mcp.run(transport=transport)
