import json
import os
from urllib import error, parse, request

from mcp.server.fastmcp import FastMCP

from .service import get_kb

mcp = FastMCP("vector-knowledge-base")
API_BASE = os.getenv("KB_API_BASE", "").rstrip("/")
NAMESPACE = os.getenv("KB_NAMESPACE", "")


def _has_api_proxy() -> bool:
    return bool(API_BASE)


def _api_request(method: str, path: str, payload: dict | None = None) -> dict | list | None:
    if not _has_api_proxy():
        raise RuntimeError("KB_API_BASE is not configured.")

    url = f"{API_BASE}{path}"
    body = None
    headers: dict[str, str] = {}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    if NAMESPACE:
        headers["X-KB-Namespace"] = NAMESPACE
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


@mcp.tool()
def list_documents() -> list[dict]:
    """List documents in the knowledge base."""
    if _has_api_proxy():
        data = _api_request("GET", "/documents")
        return data if isinstance(data, list) else []
    return get_kb(NAMESPACE).list_documents()


@mcp.tool()
def get_document(document_id: str) -> dict:
    """Get one document by id."""
    if _has_api_proxy():
        safe_id = parse.quote(document_id, safe="")
        data = _api_request("GET", f"/documents/{safe_id}")
        return {"ok": True, "document": data}

    document = get_kb(NAMESPACE).get_document(document_id)
    if document is None:
        return {"ok": False, "error": "Document not found", "document_id": document_id}
    return {"ok": True, "document": document}


@mcp.tool()
def create_document(title: str, content: str = "") -> dict:
    """Create a new document."""
    if _has_api_proxy():
        document = _api_request("POST", "/documents", {"title": title.strip(), "content": content})
        return {"ok": True, "document": document}

    document = get_kb(NAMESPACE).create_document(title=title.strip(), content=content)
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
            return {"ok": False, "error": "Document not found", "document_id": document_id}

        next_title = title.strip() if title is not None else current.get("title", "")
        next_content = content if content is not None else current.get("content", "")
        updated = _api_request(
            "PUT",
            f"/documents/{safe_id}",
            {"title": next_title, "content": next_content},
        )
        return {"ok": True, "document": updated}

    current = get_kb(NAMESPACE).get_document(document_id)
    if current is None:
        return {"ok": False, "error": "Document not found", "document_id": document_id}

    next_title = title.strip() if title is not None else current["title"]
    next_content = content if content is not None else current["content"]
    updated = get_kb(NAMESPACE).update_document(
        document_id=document_id,
        title=next_title,
        content=next_content,
    )
    return {"ok": True, "document": updated}


@mcp.tool()
def delete_document(document_id: str) -> dict:
    """Delete a document by id."""
    if _has_api_proxy():
        safe_id = parse.quote(document_id, safe="")
        _api_request("DELETE", f"/documents/{safe_id}")
        return {"ok": True, "document_id": document_id}

    deleted = get_kb(NAMESPACE).delete_document(document_id=document_id)
    if not deleted:
        return {"ok": False, "error": "Document not found", "document_id": document_id}
    return {"ok": True, "document_id": document_id}


@mcp.tool()
def search_documents(query: str, limit: int = 5) -> dict:
    """Vector-search documents by free-text query."""
    safe_limit = min(max(limit, 1), 50)
    if _has_api_proxy():
        results = _api_request("POST", "/search", {"query": query, "limit": safe_limit})
        return {"ok": True, "query": query, "results": results}

    results = get_kb(NAMESPACE).search(query=query, limit=safe_limit)
    return {"ok": True, "query": query, "results": results}


if __name__ == "__main__":
    mcp.run()
