import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";

import { deleteDocument, getDocument, updateDocument } from "@/api";
import { useAppContext } from "@/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function EditDocumentPage(): JSX.Element {
  const { setStatusMessage } = useAppContext();
  const navigate = useNavigate();
  const { documentId } = Route.useParams();
  const { ns } = Route.useSearch();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadDocument();
  }, [documentId]);

  async function loadDocument(): Promise<void> {
    try {
      setLoading(true);
      const doc = await getDocument(documentId);
      setTitle(doc.title);
      setContent(doc.content);
    } catch (error: unknown) {
      setStatusMessage(
        `Failed to open document: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setStatusMessage("Title is required.");
      return;
    }

    try {
      setSaving(true);
      const saved = await updateDocument(documentId, {
        title: cleanTitle,
        content,
      });
      setTitle(saved.title);
      setContent(saved.content);
      setStatusMessage("Document updated.");
    } catch (error: unknown) {
      setStatusMessage(
        `Save failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(): Promise<void> {
    const confirmed = window.confirm("Delete this document?");
    if (!confirmed) return;

    try {
      await deleteDocument(documentId);
      setStatusMessage("Document deleted.");
      void navigate({ to: "/documents", search: { ns: ns || undefined } });
    } catch (error: unknown) {
      setStatusMessage(
        `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-kb-soft">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto w-full max-w-[860px]">
        <Link
          to="/documents"
          search={{ ns: ns || undefined }}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-kb-accent hover:underline"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 2L4 8l6 6" />
          </svg>
          All Documents
        </Link>

        <h2 className="mb-5 text-xl font-semibold text-kb-ink">
          Edit Document
        </h2>

        <form className="space-y-5" onSubmit={(event) => void onSave(event)}>
          <div>
            <Input
              id="doc-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Document title"
              className="h-12 border-0 border-b border-kb-line bg-transparent px-0 text-2xl font-semibold text-kb-ink shadow-none ring-0 placeholder:text-kb-soft/50 focus-visible:border-kb-accent focus-visible:ring-0"
            />
          </div>

          <div>
            <Textarea
              id="doc-content"
              className="min-h-[520px] resize-y rounded-lg border-kb-line bg-kb-panel text-sm leading-relaxed text-kb-ink"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Write your knowledge entry here..."
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void onDelete()}
              >
                Delete
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/documents" search={{ ns: ns || undefined }}>
                <Button type="button" variant="outline" size="sm">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving..." : "Update"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/documents/$documentId")({
  component: EditDocumentPage,
});
