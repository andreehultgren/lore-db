import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  createDocument,
  deleteDocument,
  getDocument,
  getNamespace,
  listDocuments,
  listNamespaces,
  reloadDatabase,
  searchDocuments,
  setNamespace,
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
type AppTab = "documents" | "search" | "settings";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);
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

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchLimit, setSearchLimit] = useState<number>(10);
  const [searching, setSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);

  const [namespace, setNamespaceLocal] = useState<string>("");
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [nsInput, setNsInput] = useState<string>("");

  const isEditorOpen = editingId !== null || isCreating;

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

  async function fetchNamespaces(): Promise<void> {
    try {
      const ns = await listNamespaces();
      setNamespaces(ns);
    } catch {
      // Ignore if endpoint is unavailable.
    }
  }

  async function switchNamespace(ns: string): Promise<void> {
    setNamespace(ns);
    setNamespaceLocal(ns);
    closeEditor();
    setSearchResults([]);
    setStatusMessage(ns ? `Switched to namespace "${ns}".` : "Switched to default namespace.");
    try {
      await reloadDatabase();
    } catch {
      // Ignore reload failures.
    }
    await refreshDocuments();
    await fetchNamespaces();
  }

  async function initializeApp(): Promise<void> {
    try {
      await reloadDatabase();
    } catch {
      // Ignore startup reload failures.
    }
    await refreshDocuments();
    await fetchNamespaces();
  }

  async function refreshDocuments(): Promise<void> {
    try {
      setLoading(true);
      const docs = await listDocuments();
      setDocuments(docs);

      if (editingId && !docs.some((document) => document.id === editingId)) {
        closeEditor();
      }
    } catch (error: unknown) {
      setStatusMessage(`Failed to load documents: ${toErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function openEditorForDocument(documentId: string): Promise<void> {
    try {
      const document = await getDocument(documentId);
      setEditingId(documentId);
      setIsCreating(false);
      setDraft({ title: document.title, content: document.content });
      setActiveTab("documents");
    } catch (error: unknown) {
      setStatusMessage(`Failed to open document: ${toErrorMessage(error)}`);
    }
  }

  function closeEditor(): void {
    setEditingId(null);
    setIsCreating(false);
    setDraft(EMPTY_DRAFT);
  }

  function onCreateNew(): void {
    setEditingId(null);
    setIsCreating(true);
    setDraft(EMPTY_DRAFT);
    setActiveTab("documents");
    setStatusMessage("Creating a new document.");
  }

  function onSortDocuments(key: DocSortKey): void {
    if (key === docSortKey) {
      setDocSortDirection((value) => (value === "asc" ? "desc" : "asc"));
      return;
    }
    setDocSortKey(key);
    setDocSortDirection(key === "title" ? "asc" : "desc");
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
      const saved = editingId
        ? await updateDocument(editingId, { title: cleanTitle, content: draft.content })
        : await createDocument({ title: cleanTitle, content: draft.content });

      setStatusMessage(editingId ? "Document updated." : "Document created.");
      setEditingId(saved.id);
      setIsCreating(false);
      setDraft({ title: saved.title, content: saved.content });
      await refreshDocuments();
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

      if (editingId === documentId) {
        closeEditor();
      }
      await refreshDocuments();
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

  function sortIndicator(key: DocSortKey): string {
    if (docSortKey !== key) return "";
    return docSortDirection === "asc" ? " \u2191" : " \u2193";
  }

  return (
    <div className="page-shell">
      <div className="grid min-h-screen lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* ── Sidebar ── */}
        <aside className="flex flex-col border-r border-kb-line bg-slate-950 text-slate-100">
          <div className="border-b border-slate-800 px-4 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">Vector MCP</p>
            <h1 className="mt-1 text-xl font-semibold">Knowledge Admin</h1>
          </div>

          <div className="border-b border-slate-800 px-3 py-3">
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Namespace
            </label>
            <select
              value={namespace}
              onChange={(event) => void switchNamespace(event.target.value)}
              className="mb-2 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 outline-none focus:border-kb-accent"
            >
              <option value="">(default)</option>
              {namespaces.map((ns) => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={nsInput}
                onChange={(event) => setNsInput(event.target.value)}
                placeholder="new-namespace"
                className="h-7 min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-kb-accent"
              />
              <button
                type="button"
                className="shrink-0 rounded bg-slate-800 px-2 text-[11px] font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                disabled={!nsInput.trim()}
                onClick={() => {
                  const value = nsInput.trim();
                  if (value) {
                    setNsInput("");
                    void switchNamespace(value);
                  }
                }}
              >
                Go
              </button>
            </div>
          </div>

          <nav className="space-y-1 px-3 py-3">
            {([
              { id: "documents" as const, label: "Documents" },
              { id: "search" as const, label: "Search" },
              { id: "settings" as const, label: "Settings" },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`}
                onClick={() => { setActiveTab(tab.id); closeEditor(); }}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto border-t border-slate-800 p-3">
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

        {/* ── Main content ── */}
        <section className="flex min-h-0 flex-col bg-kb-bg">
          {/* Top bar */}
          <header className="flex items-center justify-between border-b border-kb-line bg-kb-panel px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-kb-ink">
                {activeTab === "documents"
                  ? isEditorOpen
                    ? editingId ? "Edit Document" : "New Document"
                    : "Documents"
                  : activeTab === "search"
                    ? "Search"
                    : "Settings"}
              </h2>
              {activeTab === "documents" && !isEditorOpen ? (
                <Button size="sm" onClick={onCreateNew}>
                  Add New
                </Button>
              ) : null}
            </div>
            <Button variant="outline" size="sm" onClick={() => void refreshDocuments()}>
              Refresh
            </Button>
          </header>

          {/* Status bar */}
          <div className="border-b border-kb-line bg-kb-panel/80 px-6 py-2 font-mono text-xs text-kb-soft">
            {statusMessage}
          </div>

          {/* Content area */}
          <div className="min-h-0 flex-1 overflow-auto p-6">

            {/* ── Documents tab ── */}
            {activeTab === "documents" ? (
              isEditorOpen ? (
                /* ── Editor (inline within Documents) ── */
                <div className="mx-auto w-full max-w-[860px]">
                  <button
                    type="button"
                    className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-kb-accent hover:underline"
                    onClick={closeEditor}
                  >
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 2L4 8l6 6" />
                    </svg>
                    All Documents
                  </button>

                  <form className="space-y-5" onSubmit={(event) => void onSave(event)}>
                    <div>
                      <Input
                        id="doc-title"
                        value={draft.title}
                        onChange={(event) =>
                          setDraft((previous) => ({ ...previous, title: event.target.value }))
                        }
                        placeholder="Document title"
                        className="h-12 border-0 border-b border-kb-line bg-transparent px-0 text-2xl font-semibold text-kb-ink shadow-none ring-0 placeholder:text-kb-soft/50 focus-visible:border-kb-accent focus-visible:ring-0"
                      />
                    </div>

                    <div>
                      <Textarea
                        id="doc-content"
                        className="min-h-[520px] resize-y rounded-lg border-kb-line bg-kb-panel text-sm leading-relaxed text-kb-ink"
                        value={draft.content}
                        onChange={(event) =>
                          setDraft((previous) => ({ ...previous, content: event.target.value }))
                        }
                        placeholder="Write your knowledge entry here..."
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {editingId ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => void onDeleteDocument(editingId)}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={closeEditor}>
                          Cancel
                        </Button>
                        <Button type="submit" size="sm" disabled={saving}>
                          {saving ? "Saving..." : editingId ? "Update" : "Publish"}
                        </Button>
                      </div>
                    </div>
                  </form>
                </div>
              ) : (
                /* ── Document list ── */
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-kb-soft" htmlFor="rows-per-page">
                        Show
                      </label>
                      <select
                        id="rows-per-page"
                        value={rowsPerPage}
                        onChange={(event) => setRowsPerPage(Number(event.target.value))}
                        className="h-8 rounded-md border border-kb-line bg-kb-panel px-2 text-sm text-kb-ink"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                      <span className="text-sm text-kb-soft">entries</span>
                    </div>
                    <Input
                      value={docQuery}
                      onChange={(event) => setDocQuery(event.target.value)}
                      placeholder="Filter documents..."
                      className="h-8 max-w-[280px] text-sm"
                    />
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-kb-line bg-kb-panel">
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-kb-line bg-slate-50 dark:bg-kb-bg/60">
                          <th className="px-4 py-2.5 text-left">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-kb-soft hover:text-kb-ink"
                              onClick={() => onSortDocuments("title")}
                            >
                              Title{sortIndicator("title")}
                            </button>
                          </th>
                          <th className="w-[180px] px-4 py-2.5 text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-kb-soft hover:text-kb-ink"
                              onClick={() => onSortDocuments("updated_at")}
                            >
                              Modified{sortIndicator("updated_at")}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <tr>
                            <td colSpan={2} className="px-4 py-10 text-center text-kb-soft">
                              Loading...
                            </td>
                          </tr>
                        ) : pagedDocs.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-4 py-10 text-center text-kb-soft">
                              {docQuery ? "No documents match your filter." : "No documents yet. Click \"Add New\" to create one."}
                            </td>
                          </tr>
                        ) : (
                          pagedDocs.map((document) => (
                            <tr
                              key={document.id}
                              className="group border-t border-kb-line transition hover:bg-kb-accent/5"
                            >
                              <td className="px-4 py-2.5">
                                <div>
                                  <button
                                    type="button"
                                    className="font-medium text-kb-accent hover:underline"
                                    onClick={() => void openEditorForDocument(document.id)}
                                  >
                                    {document.title}
                                  </button>
                                  <div className="mt-0.5 flex items-center gap-2 text-xs opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                      type="button"
                                      className="text-kb-accent hover:underline"
                                      onClick={() => void openEditorForDocument(document.id)}
                                    >
                                      Edit
                                    </button>
                                    <span className="text-kb-line">|</span>
                                    <button
                                      type="button"
                                      className="text-kb-danger hover:underline"
                                      onClick={() => void onDeleteDocument(document.id)}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right text-xs text-kb-soft">
                                {formatTimestamp(document.updated_at)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-kb-soft">
                      {filteredDocs.length} document{filteredDocs.length === 1 ? "" : "s"}
                      {filteredDocs.length !== documents.length ? ` (filtered from ${documents.length})` : ""}
                    </p>
                    {totalPages > 1 ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={docPage <= 1}
                          onClick={() => setDocPage((value) => Math.max(1, value - 1))}
                        >
                          Prev
                        </Button>
                        <span className="px-2 text-xs tabular-nums text-kb-soft">
                          {Math.min(docPage, totalPages)} / {totalPages}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={docPage >= totalPages}
                          onClick={() => setDocPage((value) => Math.min(totalPages, value + 1))}
                        >
                          Next
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            ) : null}

            {/* ── Search tab ── */}
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

                <div className="overflow-x-auto rounded-lg border border-kb-line bg-kb-panel">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-kb-line bg-slate-50 dark:bg-kb-bg/60">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-kb-soft">Title</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-kb-soft">Score</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-kb-soft">Preview</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-kb-soft">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-10 text-center text-kb-soft">
                            No results yet.
                          </td>
                        </tr>
                      ) : (
                        searchResults.map((result) => (
                          <tr key={result.id} className="border-t border-kb-line transition hover:bg-kb-accent/5">
                            <td className="px-4 py-2.5 align-top font-medium text-kb-ink">{result.title}</td>
                            <td className="px-4 py-2.5 align-top tabular-nums text-kb-soft">{result.score.toFixed(3)}</td>
                            <td className="px-4 py-2.5 align-top text-kb-soft">{result.content_preview}</td>
                            <td className="px-4 py-2.5">
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

            {/* ── Settings tab ── */}
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
