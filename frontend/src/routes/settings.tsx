import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { reindexDocuments } from "@/api";
import { useAppContext } from "@/context";
import { Button } from "@/components/ui/button";

function SettingsPage(): JSX.Element {
  const { setStatusMessage } = useAppContext();
  const [reindexing, setReindexing] = useState(false);
  const [lastResult, setLastResult] = useState<number | null>(null);

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
      </div>
    </div>
  );
}

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});
