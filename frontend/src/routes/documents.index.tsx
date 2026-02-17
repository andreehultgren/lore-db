import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { deleteDocument, listDocuments, type KnowledgeDocument } from "@/api";
import { useAppContext } from "@/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DocSortKey = "updated_at" | "title";
type SortDirection = "asc" | "desc";

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function DocumentListPage(): JSX.Element {
  const { setStatusMessage } = useAppContext();
  const { ns } = Route.useSearch();

  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [docQuery, setDocQuery] = useState<string>("");
  const [docPage, setDocPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [docSortKey, setDocSortKey] = useState<DocSortKey>("updated_at");
  const [docSortDirection, setDocSortDirection] =
    useState<SortDirection>("desc");

  const filteredDocs = useMemo(() => {
    const query = docQuery.trim().toLowerCase();
    if (!query) return documents;
    return documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(query) ||
        doc.content.toLowerCase().includes(query),
    );
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
    void refreshDocuments();
  }, [ns]);

  useEffect(() => {
    setDocPage(1);
  }, [docQuery, rowsPerPage]);

  useEffect(() => {
    if (docPage > totalPages) {
      setDocPage(totalPages);
    }
  }, [docPage, totalPages]);

  async function refreshDocuments(): Promise<void> {
    try {
      setLoading(true);
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (error: unknown) {
      setStatusMessage(
        `Failed to load documents: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  }

  async function onDeleteDocument(documentId: string): Promise<void> {
    const confirmed = window.confirm("Delete this document?");
    if (!confirmed) return;

    try {
      await deleteDocument(documentId);
      setStatusMessage("Document deleted.");
      await refreshDocuments();
    } catch (error: unknown) {
      setStatusMessage(
        `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  function onSortDocuments(key: DocSortKey): void {
    if (key === docSortKey) {
      setDocSortDirection((value) => (value === "asc" ? "desc" : "asc"));
      return;
    }
    setDocSortKey(key);
    setDocSortDirection(key === "title" ? "asc" : "desc");
  }

  function sortIndicator(key: DocSortKey): string {
    if (docSortKey !== key) return "";
    return docSortDirection === "asc" ? " \u2191" : " \u2193";
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-kb-ink">Documents</h2>
          <Link to="/documents/new" search={{ ns: ns || undefined }}>
            <Button size="sm">Add New</Button>
          </Link>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refreshDocuments()}
        >
          Refresh
        </Button>
      </div>

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
                  <td
                    colSpan={2}
                    className="px-4 py-10 text-center text-kb-soft"
                  >
                    Loading...
                  </td>
                </tr>
              ) : pagedDocs.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-10 text-center text-kb-soft"
                  >
                    {docQuery
                      ? "No documents match your filter."
                      : 'No documents yet. Click "Add New" to create one.'}
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
                        <Link
                          to="/documents/$documentId"
                          params={{ documentId: document.id }}
                          search={{ ns: ns || undefined }}
                          className="font-medium text-kb-accent hover:underline"
                        >
                          {document.title}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2 text-xs opacity-0 transition-opacity group-hover:opacity-100">
                          <Link
                            to="/documents/$documentId"
                            params={{ documentId: document.id }}
                            search={{ ns: ns || undefined }}
                            className="text-kb-accent hover:underline"
                          >
                            Edit
                          </Link>
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
            {filteredDocs.length !== documents.length
              ? ` (filtered from ${documents.length})`
              : ""}
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
                onClick={() =>
                  setDocPage((value) => Math.min(totalPages, value + 1))
                }
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/documents/")({
  component: DocumentListPage,
});
