from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    Document,
    DocumentCreate,
    DocumentUpdate,
    SearchRequest,
    SearchResult,
)
from .service import get_kb, list_namespaces, reload_kb

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


@app.post("/search", response_model=list[SearchResult])
def search(payload: SearchRequest, x_kb_namespace: str = Header("")) -> list[dict]:
    return get_kb(x_kb_namespace).search(query=payload.query, limit=payload.limit)
