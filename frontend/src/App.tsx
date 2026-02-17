import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  reloadDatabase,
  searchDocuments,
  updateDocument,
  type KnowledgeDocument,
  type SearchHit
} from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Draft = {
  title: string;
  content: string;
};

type ThemeMode = "light" | "dark";
type AppTab = "documents" | "editor" | "search" | "settings";
type DocSortKey = "updated_at" | "title";
type SortDirection = "asc" | "desc";

const EMPTY_DRAFT: Draft = { title: "", content: "" };

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function previewText(content: string, maxLength = 95): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "(No content)";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function SunIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 1 0 11.5 11.5Z" fill="currentColor" />
    </svg>
  );
}

export default function App(): JSX.Element {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const [statusMessage, setStatusMessage] = useState<string>("Ready.");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [activeTab, setActiveTab] = useState<AppTab>("documents");

  const [docQuery, setDocQuery] = useState<string>("");
  const [docPage, setDocPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [docSortKey, setDocSortKey] = useState<DocSortKey>("updated_at");
  const [docSortDirection, setDocSortDirection] = useState<SortDirection>("desc");

  const [previewId, setPreviewId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchLimit, setSearchLimit] = useState<number>(10);
  const [searching, setSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedId) ?? null,
    [documents, selectedId]
  );

  const previewDocument = useMemo(
    () => documents.find((document) => document.id === previewId) ?? null,
    [documents, previewId]
  );

  const filteredDocs = useMemo(() => {
    const query = docQuery.trim().toLowerCase();
    if (!query) {
      return documents;
    }
    return documents.filter((document) => {
      return (
        document.title.toLowerCase().includes(query) ||
        document.content.toLowerCase().includes(query)
      );
    });
  }, [documents, docQuery]);

  const sortedDocs = useMemo(() => {
    const next = [...filteredDocs];
    next.sort((a, b) => {
      if (docSortKey === "updated_at") {
        const cmp = a.updated_at.localeCompare(b.updated_at);
        return docSortDirection === "asc" ? cmp : -cmp;
      }
      const cmp = a.title.localeCompare(b.title);
      return docSortDirection === "asc" ? cmp : -cmp;
    });
    return next;
  }, [filteredDocs, docSortDirection, docSortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedDocs.length / rowsPerPage));
  const pagedDocs = useMemo(() => {
    const safePage = Math.min(Math.max(docPage, 1), totalPages);
    const start = (safePage - 1) * rowsPerPage;
    return sortedDocs.slice(start, start + rowsPerPage);
  }, [docPage, rowsPerPage, sortedDocs, totalPages]);

  useEffect(() => {
    void initializeApp();
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("kb-theme");
    if (stored === "dark" || stored === "light") {
      setThemeMode(stored);
      return;
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setThemeMode(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    window.localStorage.setItem("kb-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    setDocPage(1);
  }, [docQuery, rowsPerPage]);

  useEffect(() => {
    if (docPage > totalPages) {
      setDocPage(totalPages);
    }
  }, [docPage, totalPages]);

  async function initializeApp(): Promise<void> {
    try {
      await reloadDatabase();
    } catch {
      // Ignore startup reload failures.
    }
    await refreshDocuments();
  }

  async function refreshDocuments(preferredId: string | null = null): Promise<void> {
    try {
      setLoading(true);
      const docs = await listDocuments();
      setDocuments(docs);

      if (!preferredId) {
        if (selectedId && !docs.some((document) => document.id === selectedId)) {
          setSelectedId(null);
          setDraft(EMPTY_DRAFT);
        }
        return;
      }

      if (!docs.some((document) => document.id === preferredId)) {
        return;
      }
      await openEditorForDocument(preferredId);
    } catch (error: unknown) {
      setStatusMessage(`Failed to load documents: ${toErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function openEditorForDocument(documentId: string): Promise<void> {
    const document = await getDocument(documentId);
    setSelectedId(documentId);
    setDraft({ title: document.title, content: document.content });
    setActiveTab("editor");
  }

  function onSortDocuments(key: DocSortKey): void {
    if (key === docSortKey) {
      setDocSortDirection((value) => (value === "asc" ? "desc" : "asc"));
      return;
    }
    setDocSortKey(key);
    setDocSortDirection(key === "title" ? "asc" : "desc");
  }

  function onCreateNew(): void {
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
    setActiveTab("editor");
    setStatusMessage("Creating a new document.");
  }

  async function onSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const cleanTitle = draft.title.trim();
    if (!cleanTitle) {
      setStatusMessage("Title is required.");
      return;
    }

    try {
      setSaving(true);
      const saved = selectedId
        ? await updateDocument(selectedId, { title: cleanTitle, content: draft.content })
        : await createDocument({ title: cleanTitle, content: draft.content });

      setStatusMessage(selectedId ? "Document updated." : "Document created.");
      await refreshDocuments(saved.id);
    } catch (error: unknown) {
      setStatusMessage(`Save failed: ${toErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteDocument(documentId: string): Promise<void> {
    const confirmed = window.confirm("Delete this document?");
    if (!confirmed) {
      return;
    }

    try {
      await deleteDocument(documentId);
      setStatusMessage("Document deleted.");
      setSearchResults((previous) => previous.filter((result) => result.id !== documentId));

      if (selectedId === documentId) {
        setSelectedId(null);
        setDraft(EMPTY_DRAFT);
      }
      if (previewId === documentId) {
        setPreviewId(null);
      }
      await refreshDocuments();
      setActiveTab("documents");
    } catch (error: unknown) {
      setStatusMessage(`Delete failed: ${toErrorMessage(error)}`);
    }
  }

  async function onRunSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const results = await searchDocuments(query, searchLimit);
      setSearchResults(results);
      setStatusMessage(`Found ${results.length} matching document(s).`);
    } catch (error: unknown) {
      setStatusMessage(`Search failed: ${toErrorMessage(error)}`);
    } finally {
      setSearching(false);
    }
  }

  async function onOpenSearchResult(documentId: string): Promise<void> {
    try {
      await openEditorForDocument(documentId);
      setStatusMessage("Loaded search result.");
    } catch (error: unknown) {
      setStatusMessage(`Could not open search result: ${toErrorMessage(error)}`);
    }
  }

  return (
    <div className="page-shell">
      <div className="grid min-h-screen lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col border-r border-kb-line bg-slate-950 text-slate-100">
          <div className="border-b border-slate-800 px-4 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">Vector MCP</p>
            <h1 className="mt-1 text-xl font-semibold">Knowledge Admin</h1>
          </div>

          <nav className="space-y-1 px-3 py-3">
            <button
              type="button"
              className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                activeTab === "documents"
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white"
              }`}
              onClick={() => setActiveTab("documents")}
            >
              Documents
            </button>
            <button
              type="button"
              className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                activeTab === "editor"
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white"
              }`}
              onClick={() => setActiveTab("editor")}
            >
              Editor
            </button>
            <button
              type="button"
              className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                activeTab === "search"
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white"
              }`}
              onClick={() => setActiveTab("search")}
            >
              Search
            </button>
            <button
              type="button"
              className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                activeTab === "settings"
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white"
              }`}
              onClick={() => setActiveTab("settings")}
            >
              Settings
            </button>
          </nav>

          <div className="mt-auto space-y-3 border-t border-slate-800 p-3">
            <Button className="w-full" onClick={onCreateNew}>
              Add Document
            </Button>

            <button
              type="button"
              className="relative inline-flex h-9 w-full items-center rounded-md border border-slate-700 bg-slate-900 px-1.5 text-slate-300"
              onClick={() => setThemeMode((value) => (value === "light" ? "dark" : "light"))}
              aria-label={`Switch to ${themeMode === "light" ? "dark" : "light"} mode`}
              title={`Switch to ${themeMode === "light" ? "dark" : "light"} mode`}
            >
              <span className="absolute left-2.5">
                <SunIcon />
              </span>
              <span className="absolute right-2.5">
                <MoonIcon />
              </span>
              <span
                className={`absolute top-[3px] flex h-7 w-7 items-center justify-center rounded bg-kb-accent text-white transition-all ${
                  themeMode === "light" ? "left-[3px]" : "right-[3px]"
                }`}
              >
                {themeMode === "light" ? <SunIcon /> : <MoonIcon />}
              </span>
            </button>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col bg-kb-bg">
          <header className="flex items-center justify-between border-b border-kb-line bg-kb-panel px-6 py-4">
            <div>
              <h2 className="text-xl font-semibold text-kb-ink">
                {activeTab === "documents" ? "Documents" : activeTab === "editor" ? "Editor" : activeTab === "search" ? "Search" : "Settings"}
              </h2>
            </div>
            <Button variant="outline" onClick={() => void refreshDocuments()}>
              Refresh
            </Button>
          </header>

          <div className="border-b border-kb-line bg-kb-panel/80 px-6 py-2 font-mono text-xs text-kb-soft">
            {statusMessage}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-6">
            {activeTab === "documents" ? (
              previewDocument ? (
                <div className="mx-auto w-full max-w-[1000px] space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-kb-ink">{previewDocument.title}</h3>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => setPreviewId(null)}>
                        Back
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void openEditorForDocument(previewDocument.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => void onDeleteDocument(previewDocument.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-kb-soft">
                    Last updated {formatTimestamp(previewDocument.updated_at)}
                  </p>
                  <div className="rounded-md border border-kb-line bg-kb-panel p-4">
                    <pre className="whitespace-pre-wrap text-sm text-kb-ink">{previewDocument.content || "(No content)"}</pre>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-kb-soft" htmlFor="rows-per-page">
                        Records per page
                      </label>
                      <select
                        id="rows-per-page"
                        value={rowsPerPage}
                        onChange={(event) => setRowsPerPage(Number(event.target.value))}
                        className="h-9 rounded-md border border-kb-line bg-kb-panel px-2 text-sm text-kb-ink"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                    <Input
                      value={docQuery}
                      onChange={(event) => setDocQuery(event.target.value)}
                      placeholder="Search documents"
                      className="max-w-[320px]"
                    />
                  </div>

                  <div className="overflow-x-auto rounded-md border border-kb-line bg-kb-panel">
                    <table className="min-w-full border-collapse text-sm">
                      <thead className="bg-slate-100 text-left dark:bg-kb-bg/70">
                        <tr>
                          <th className="px-3 py-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 font-semibold text-kb-ink"
                              onClick={() => onSortDocuments("title")}
                            >
                              Title
                              <span className="text-kb-soft">
                                {docSortKey === "title" ? (docSortDirection === "asc" ? "^" : "v") : "<>"}
                              </span>
                            </button>
                          </th>
                          <th className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 font-semibold text-kb-ink"
                              onClick={() => onSortDocuments("updated_at")}
                            >
                              Updated
                              <span className="text-kb-soft">
                                {docSortKey === "updated_at" ? (docSortDirection === "asc" ? "^" : "v") : "<>"}
                              </span>
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td colSpan={2} className="px-3 py-8 text-center text-kb-soft">
                              Loading...
                            </td>
                          </tr>
                        ) : pagedDocs.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-3 py-8 text-center text-kb-soft">
                              No documents found.
                            </td>
                          </tr>
                        ) : (
                          pagedDocs.map((document) => (
                            <tr
                              key={document.id}
                              className="cursor-pointer border-t border-kb-line bg-kb-panel hover:bg-kb-accent/10 transition"
                              onClick={() => setPreviewId(document.id)}
                            >
                              <td className="px-3 py-2 font-medium text-kb-ink">{document.title}</td>
                              <td className="px-3 py-2 text-right text-kb-soft">{formatTimestamp(document.updated_at)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-kb-soft">
                      Showing page {Math.min(docPage, totalPages)} of {totalPages} ({filteredDocs.length} records)
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={docPage <= 1}
                        onClick={() => setDocPage((value) => Math.max(1, value - 1))}
                      >
                        Prev
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={docPage >= totalPages}
                        onClick={() => setDocPage((value) => Math.min(totalPages, value + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )
            ) : null}

            {activeTab === "editor" ? (
              <div className="mx-auto w-full max-w-[1000px] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-kb-ink">
                    {selectedId ? "Edit document" : "Create document"}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setActiveTab("documents")}>
                      Back to documents
                    </Button>
                    {selectedId ? (
                      <Button variant="destructive" onClick={() => void onDeleteDocument(selectedId)}>
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </div>

                <form className="space-y-4" onSubmit={(event) => void onSave(event)}>
                  <div className="space-y-1">
                    <label htmlFor="doc-title" className="text-sm text-kb-soft">
                      Title
                    </label>
                    <Input
                      id="doc-title"
                      value={draft.title}
                      onChange={(event) =>
                        setDraft((previous) => ({ ...previous, title: event.target.value }))
                      }
                      placeholder="Document title"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="doc-content" className="text-sm text-kb-soft">
                      Content
                    </label>
                    <Textarea
                      id="doc-content"
                      className="min-h-[520px] resize-y"
                      value={draft.content}
                      onChange={(event) =>
                        setDraft((previous) => ({ ...previous, content: event.target.value }))
                      }
                      placeholder="Write your knowledge entry here"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </form>
              </div>
            ) : null}

            {activeTab === "search" ? (
              <div className="space-y-4">
                <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_140px]" onSubmit={(event) => void onRunSearch(event)}>
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search for related knowledge"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={searchLimit}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      if (Number.isNaN(value)) {
                        setSearchLimit(10);
                        return;
                      }
                      setSearchLimit(Math.max(1, Math.min(50, value)));
                    }}
                  />
                  <Button type="submit" disabled={searching}>
                    {searching ? "Searching..." : "Run search"}
                  </Button>
                </form>

                <div className="overflow-x-auto rounded-md border border-kb-line bg-kb-panel">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-slate-100 text-left dark:bg-kb-bg/70">
                      <tr>
                        <th className="px-3 py-2 font-semibold text-kb-ink">Title</th>
                        <th className="px-3 py-2 font-semibold text-kb-ink">Score</th>
                        <th className="px-3 py-2 font-semibold text-kb-ink">Preview</th>
                        <th className="px-3 py-2 text-right font-semibold text-kb-ink">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-8 text-center text-kb-soft">
                            No results yet.
                          </td>
                        </tr>
                      ) : (
                        searchResults.map((result) => (
                          <tr key={result.id} className="border-t border-kb-line bg-kb-panel">
                            <td className="px-3 py-2 align-top font-medium text-kb-ink">{result.title}</td>
                            <td className="px-3 py-2 align-top text-kb-soft">{result.score.toFixed(3)}</td>
                            <td className="px-3 py-2 align-top text-kb-soft">{result.content_preview}</td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void onOpenSearchResult(result.id)}
                                >
                                  Open
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {activeTab === "settings" ? (
              <div className="max-w-[900px] text-sm text-kb-soft">
                Settings is reserved for upcoming features.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
