const API_BASE = (
  import.meta.env.VITE_API_BASE ?? "http://localhost:8000"
).replace(/\/$/, "");

let _namespace = "";

export function setNamespace(ns: string): void {
  _namespace = ns;
}

export function getNamespace(): string {
  return _namespace;
}

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
      "X-Kb-Namespace": _namespace,
      ...(options.headers ?? {}),
    },
    ...options,
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

export function listNamespaces(): Promise<string[]> {
  return request<string[]>("/namespaces");
}

export function listDocuments(): Promise<KnowledgeDocument[]> {
  return request<KnowledgeDocument[]>("/documents");
}

export function reloadDatabase(): Promise<{ status: string }> {
  return request<{ status: string }>("/reload-db", { method: "POST" });
}

export function reindexDocuments(): Promise<{ status: string; reindexed: number }> {
  return request<{ status: string; reindexed: number }>("/reindex", { method: "POST" });
}

export function getDocument(documentId: string): Promise<KnowledgeDocument> {
  return request<KnowledgeDocument>(`/documents/${documentId}`);
}

export function createDocument(payload: {
  title: string;
  content: string;
}): Promise<KnowledgeDocument> {
  return request<KnowledgeDocument>("/documents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDocument(
  documentId: string,
  payload: { title: string; content: string },
): Promise<KnowledgeDocument> {
  return request<KnowledgeDocument>(`/documents/${documentId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteDocument(documentId: string): Promise<null> {
  return request<null>(`/documents/${documentId}`, { method: "DELETE" });
}

export function searchDocuments(
  query: string,
  limit = 5,
): Promise<SearchHit[]> {
  return request<SearchHit[]>("/search", {
    method: "POST",
    body: JSON.stringify({ query, limit }),
  });
}

// ── Export / Import ──

export interface ExportPayload {
  version: number;
  namespace: string;
  exported_at: string;
  documents: Array<{ title: string; content: string }>;
}

export function exportNamespace(): Promise<ExportPayload> {
  return request<ExportPayload>("/export");
}

export function importNamespace(payload: {
  documents: Array<{ title: string; content: string }>;
  mode: "merge" | "replace";
}): Promise<{ imported: number }> {
  return request<{ imported: number }>("/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Analytics ──

export interface AnalyticsEvent {
  id: string;
  timestamp: string;
  event_type: string;
  namespace: string;
  document_id: string | null;
  document_title: string | null;
  query: string | null;
  result_count: number | null;
}

export interface AnalyticsStats {
  total_events: number;
  events_by_type: Record<string, number>;
  top_searches: Array<{ query: string; count: number }>;
  top_documents: Array<{
    document_id: string;
    document_title: string | null;
    count: number;
  }>;
  recent_events: AnalyticsEvent[];
}

export interface AnalyticsEventsResponse {
  events: AnalyticsEvent[];
  total: number;
}

export function getAnalyticsStats(namespace?: string): Promise<AnalyticsStats> {
  const qs = namespace ? `?namespace=${encodeURIComponent(namespace)}` : "";
  return request<AnalyticsStats>(`/analytics/stats${qs}`);
}

export function getAnalyticsEvents(options?: {
  event_type?: string;
  namespace?: string;
  limit?: number;
  offset?: number;
}): Promise<AnalyticsEventsResponse> {
  const params = new URLSearchParams();
  if (options?.event_type) params.set("event_type", options.event_type);
  if (options?.namespace !== undefined)
    params.set("namespace", options.namespace);
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  if (options?.offset !== undefined)
    params.set("offset", String(options.offset));
  const qs = params.toString() ? `?${params.toString()}` : "";
  return request<AnalyticsEventsResponse>(`/analytics/events${qs}`);
}
