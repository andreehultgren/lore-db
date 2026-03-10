from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .analytics import get_analytics
from .models import (
    Document,
    DocumentCreate,
    DocumentUpdate,
    SearchRequest,
    SearchResult,
    StaleDocument,
)
from .service import get_kb, list_namespaces, reload_kb


class AnalyticsEventCreate(BaseModel):
    event_type: str = Field(min_length=1)
    namespace: str = Field(default="")
    document_id: str | None = None
    document_title: str | None = None
    query: str | None = None
    result_count: int | None = None


class ImportDocument(BaseModel):
    title: str = Field(min_length=1)
    content: str = Field(default="")


class ImportPayload(BaseModel):
    documents: list[ImportDocument]
    mode: Literal["merge", "replace"] = "merge"

app = FastAPI(title="Lore DB API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/namespaces")
def get_namespaces() -> list[str]:
    return list_namespaces()


@app.post("/reload-db")
def reload_database(x_kb_namespace: str = Header("")) -> dict[str, str]:
    reload_kb(x_kb_namespace)
    return {"status": "reloaded"}


@app.post("/reindex")
def reindex(x_kb_namespace: str = Header("")) -> dict:
    """Re-embed all documents using the current embedder. Run after switching embedders."""
    count = get_kb(x_kb_namespace).reindex_all()
    return {"status": "ok", "reindexed": count}


@app.get("/documents", response_model=list[Document])
def list_documents(x_kb_namespace: str = Header("")) -> list[dict]:
    return get_kb(x_kb_namespace).list_documents()


@app.get("/documents/{document_id}", response_model=Document)
def get_document(document_id: str, x_kb_namespace: str = Header("")) -> dict:
    document = get_kb(x_kb_namespace).get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@app.post("/documents", response_model=Document, status_code=201)
def create_document(payload: DocumentCreate, x_kb_namespace: str = Header("")) -> dict:
    return get_kb(x_kb_namespace).create_document(
        title=payload.title.strip(), content=payload.content
    )


@app.put("/documents/{document_id}", response_model=Document)
def update_document(
    document_id: str, payload: DocumentUpdate, x_kb_namespace: str = Header("")
) -> dict:
    updated = get_kb(x_kb_namespace).update_document(
        document_id=document_id,
        title=payload.title.strip(),
        content=payload.content,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return updated


@app.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: str, x_kb_namespace: str = Header("")) -> None:
    deleted = get_kb(x_kb_namespace).delete_document(document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")


@app.post("/documents/{document_id}/verify", response_model=Document)
def verify_document(document_id: str, x_kb_namespace: str = Header("")) -> dict:
    verified = get_kb(x_kb_namespace).verify_document(document_id)
    if verified is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return verified


@app.get("/stale-documents", response_model=list[StaleDocument])
def get_stale_documents(
    days_threshold: int = Query(default=30, ge=1),
    x_kb_namespace: str = Header(""),
) -> list[dict]:
    return get_kb(x_kb_namespace).get_stale_documents(days_threshold=days_threshold)


@app.post("/search", response_model=list[SearchResult])
def search(payload: SearchRequest, x_kb_namespace: str = Header("")) -> list[dict]:
    return get_kb(x_kb_namespace).search(query=payload.query, limit=payload.limit)


# ── Export / Import ──


@app.get("/export")
def export_namespace(x_kb_namespace: str = Header("")) -> dict:
    kb = get_kb(x_kb_namespace)
    documents = kb.list_documents()
    return {
        "version": 1,
        "namespace": x_kb_namespace,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "documents": [{"title": doc["title"], "content": doc["content"]} for doc in documents],
    }


@app.post("/import")
def import_namespace(payload: ImportPayload, x_kb_namespace: str = Header("")) -> dict:
    kb = get_kb(x_kb_namespace)
    if payload.mode == "replace":
        for doc in kb.list_documents():
            kb.delete_document(doc["id"])
    for doc in payload.documents:
        kb.create_document(title=doc.title.strip(), content=doc.content)
    return {"imported": len(payload.documents)}


# ── Analytics ──


@app.post("/analytics/events", status_code=201)
def log_analytics_event(payload: AnalyticsEventCreate) -> dict:
    return get_analytics().log(
        event_type=payload.event_type,
        namespace=payload.namespace,
        document_id=payload.document_id,
        document_title=payload.document_title,
        query=payload.query,
        result_count=payload.result_count,
    )


@app.get("/analytics/stats")
def get_analytics_stats(namespace: str | None = Query(default=None)) -> dict:
    return get_analytics().get_stats(namespace=namespace)


@app.get("/analytics/events")
def get_analytics_events(
    event_type: str | None = Query(default=None),
    namespace: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return get_analytics().get_events(
        limit=limit,
        offset=offset,
        event_type=event_type,
        namespace=namespace,
    )
