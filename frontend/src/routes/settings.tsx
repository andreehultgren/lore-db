import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { exportNamespace, getNamespace, importNamespace, reindexDocuments } from "@/api";
import { useAppContext } from "@/context";
import { Button } from "@/components/ui/button";

function SettingsPage(): JSX.Element {
  const { setStatusMessage } = useAppContext();
  const [reindexing, setReindexing] = useState(false);
  const [lastResult, setLastResult] = useState<number | null>(null);

  const [exporting, setExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importing, setImporting] = useState(false);

  async function onReindex(): Promise<void> {
    setReindexing(true);
    setLastResult(null);
    try {
      const result = await reindexDocuments();
      setLastResult(result.reindexed);
      setStatusMessage(`Reindexed ${result.reindexed} document${result.reindexed === 1 ? "" : "s"}.`);
    } catch (error: unknown) {
      setStatusMessage(
        `Reindex failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setReindexing(false);
    }
  }

  async function onExport(): Promise<void> {
    setExporting(true);
    try {
      const data = await exportNamespace();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${getNamespace() || "default"}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      setStatusMessage(
        `Export failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setExporting(false);
    }
  }

  async function onImport(): Promise<void> {
    if (!importFile) return;
    setImporting(true);
    try {
      const text = await importFile.text();
      const parsed: unknown = JSON.parse(text);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !Array.isArray((parsed as Record<string, unknown>)["documents"])
      ) {
        setStatusMessage("Import failed: invalid file format (expected { documents: [...] }).");
        return;
      }
      const payload = parsed as { documents: Array<{ title: string; content: string }> };
      const result = await importNamespace({ documents: payload.documents, mode: importMode });
      setStatusMessage(`Imported ${result.imported} document${result.imported === 1 ? "" : "s"}.`);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error: unknown) {
      setStatusMessage(
        `Import failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="p-6">
      <h2 className="mb-6 text-xl font-semibold text-kb-ink">Settings</h2>

      <div className="max-w-[640px] space-y-6">
        <div className="rounded-lg border border-kb-line bg-kb-panel p-5">
          <div className="mb-1 font-medium text-kb-ink">Reindex Documents</div>
          <p className="mb-4 text-sm text-kb-soft">
            Re-embeds all documents using the current semantic embedding model.
            Run this after upgrading the embedder or on first deploy.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => void onReindex()}
              disabled={reindexing}
            >
              {reindexing ? "Reindexing…" : "Reindex"}
            </Button>
            {lastResult !== null && !reindexing && (
              <span className="text-sm text-kb-soft">
                {lastResult} document{lastResult === 1 ? "" : "s"} reindexed.
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-kb-line bg-kb-panel p-5">
          <div className="mb-1 font-medium text-kb-ink">Export Namespace</div>
          <p className="mb-4 text-sm text-kb-soft">
            Download all documents in this namespace as a JSON file. Useful for
            backups or migrating to another machine.
          </p>
          <Button
            variant="outline"
            onClick={() => void onExport()}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "Export"}
          </Button>
        </div>

        <div className="rounded-lg border border-kb-line bg-kb-panel p-5">
          <div className="mb-1 font-medium text-kb-ink">Import Namespace</div>
          <p className="mb-4 text-sm text-kb-soft">
            Import documents from a previously exported JSON file.
          </p>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose file…
              </Button>
              <span className="text-sm text-kb-soft">
                {importFile ? importFile.name : "No file chosen"}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-kb-soft">Mode:</span>
              {(["merge", "replace"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setImportMode(mode)}
                  className={`rounded px-3 py-1 text-sm transition-colors ${
                    importMode === mode
                      ? "bg-kb-accent text-white"
                      : "border border-kb-line text-kb-soft hover:border-kb-accent hover:text-kb-ink"
                  }`}
                >
                  {mode === "merge" ? "Merge" : "Replace"}
                </button>
              ))}
              <span className="text-xs text-kb-soft">
                {importMode === "merge"
                  ? "Add to existing documents"
                  : "Overwrite all existing documents"}
              </span>
            </div>

            <Button
              variant="outline"
              onClick={() => void onImport()}
              disabled={!importFile || importing}
            >
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});
