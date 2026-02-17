from datetime import datetime

from pydantic import BaseModel, Field


class DocumentBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="")


class DocumentCreate(DocumentBase):
    pass


class DocumentUpdate(DocumentBase):
    pass


class Document(DocumentBase):
    id: str
    created_at: datetime
    updated_at: datetime


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    limit: int = Field(default=5, ge=1, le=50)


class SearchResult(BaseModel):
    id: str
    title: str
    content_preview: str
    score: float

