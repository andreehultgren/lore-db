const API_BASE = (import.meta.env.VITE_API_BASE ?? "http://localhost:8000").replace(/\/$/, "");

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface SearchHit {
  id: string;
  title: string;
  content_preview: string;
  score: number;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
}

export function listDocuments(): Promise<KnowledgeDocument[]> {
  return request<KnowledgeDocument[]>("/documents");
}

export function reloadDatabase(): Promise<{ status: string }> {
  return request<{ status: string }>("/reload-db", { method: "POST" });
}

export function getDocument(documentId: string): Promise<KnowledgeDocument> {
  return request<KnowledgeDocument>(`/documents/${documentId}`);
}

export function createDocument(payload: { title: string; content: string }): Promise<KnowledgeDocument> {
  return request<KnowledgeDocument>("/documents", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateDocument(
  documentId: string,
  payload: { title: string; content: string }
): Promise<KnowledgeDocument> {
  return request<KnowledgeDocument>(`/documents/${documentId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteDocument(documentId: string): Promise<null> {
  return request<null>(`/documents/${documentId}`, { method: "DELETE" });
}

export function searchDocuments(query: string, limit = 5): Promise<SearchHit[]> {
  return request<SearchHit[]>("/search", {
    method: "POST",
    body: JSON.stringify({ query, limit })
  });
}
