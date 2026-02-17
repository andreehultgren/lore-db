import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { createDocument } from "@/api";
import { useAppContext } from "@/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function NewDocumentPage(): JSX.Element {
  const { setStatusMessage } = useAppContext();
  const navigate = useNavigate();
  const { ns } = Route.useSearch();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setStatusMessage("Title is required.");
      return;
    }

    try {
      setSaving(true);
      const saved = await createDocument({ title: cleanTitle, content });
      setStatusMessage("Document created.");
      void navigate({
        to: "/documents/$documentId",
        params: { documentId: saved.id },
        search: { ns: ns || undefined }
      });
    } catch (error: unknown) {
      setStatusMessage(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mx-auto w-full max-w-[860px]">
        <Link
          to="/documents"
          search={{ ns: ns || undefined }}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-kb-accent hover:underline"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2L4 8l6 6" />
          </svg>
          All Documents
        </Link>

        <h2 className="mb-5 text-xl font-semibold text-kb-ink">New Document</h2>

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

          <div className="flex items-center justify-end gap-2">
            <Link to="/documents" search={{ ns: ns || undefined }}>
              <Button type="button" variant="outline" size="sm">
                Cancel
              </Button>
            </Link>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving..." : "Publish"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/documents/new")({
  component: NewDocumentPage
});
