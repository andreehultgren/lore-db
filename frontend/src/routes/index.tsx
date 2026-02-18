import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { listDocuments } from "@/api";
import { useAppContext } from "@/context";
import { Button } from "@/components/ui/button";

function DashboardPage(): JSX.Element {
  const { setStatusMessage } = useAppContext();
  const { ns } = Route.useSearch();

  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    void loadStats();
  }, [ns]);

  async function loadStats(): Promise<void> {
    try {
      setLoading(true);
      const docs = await listDocuments();
      setDocumentCount(docs.length);
    } catch (error: unknown) {
      setStatusMessage(
        `Failed to load stats: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-kb-ink">Dashboard</h2>
        <p className="mt-1 text-sm text-kb-soft">
          Overview of your knowledge base
          {ns ? ` — namespace: ${ns}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Documents stat card */}
        <div className="rounded-lg border border-kb-line bg-kb-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-kb-soft">
            Documents
          </p>
          <p className="mt-2 text-4xl font-bold tabular-nums text-kb-ink">
            {loading ? "—" : (documentCount ?? 0)}
          </p>
          <div className="mt-4">
            <Link to="/documents" search={{ ns: ns || undefined }}>
              <Button variant="outline" size="sm">
                View all
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: DashboardPage,
});
