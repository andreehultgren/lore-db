import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  listDocuments,
  getAnalyticsStats,
  type AnalyticsStats,
} from "@/api";
import { useAppContext } from "@/context";
import { Button } from "@/components/ui/button";

function StatCard({
  label,
  value,
  loading,
  children,
}: {
  label: string;
  value: string | number;
  loading: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-kb-line bg-kb-panel p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-kb-soft">
        {label}
      </p>
      <p className="mt-2 text-4xl font-bold tabular-nums text-kb-ink">
        {loading ? "—" : value}
      </p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

function DashboardPage(): JSX.Element {
  const { setStatusMessage } = useAppContext();
  const { ns } = Route.useSearch();

  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    void loadData();
  }, [ns]);

  async function loadData(): Promise<void> {
    try {
      setLoading(true);
      const [docs, analyticsStats] = await Promise.all([
        listDocuments(),
        getAnalyticsStats(ns || undefined),
      ]);
      setDocumentCount(docs.length);
      setStats(analyticsStats);
    } catch (error: unknown) {
      setStatusMessage(
        `Failed to load dashboard: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  }

  const searchCount = stats?.events_by_type["search"] ?? 0;
  const viewCount = stats?.events_by_type["get_document"] ?? 0;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-kb-ink">Dashboard</h2>
        <p className="mt-1 text-sm text-kb-soft">
          Overview of your knowledge base
          {ns ? ` — namespace: ${ns}` : ""}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Documents" value={documentCount ?? 0} loading={loading}>
          <Link to="/documents" search={{ ns: ns || undefined }}>
            <Button variant="outline" size="sm">
              View all
            </Button>
          </Link>
        </StatCard>

        <StatCard
          label="MCP Requests"
          value={stats?.total_events ?? 0}
          loading={loading}
        >
          <Link to="/analytics" search={{ ns: ns || undefined }}>
            <Button variant="outline" size="sm">
              Explore
            </Button>
          </Link>
        </StatCard>

        <StatCard label="Searches" value={searchCount} loading={loading} />

        <StatCard label="Document Views" value={viewCount} loading={loading} />
      </div>

      {/* Top searches & top documents */}
      {!loading && stats && (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Top search queries */}
          <div className="rounded-lg border border-kb-line bg-kb-panel">
            <div className="flex items-center justify-between border-b border-kb-line px-5 py-3">
              <h3 className="text-sm font-semibold text-kb-ink">
                Top Search Queries
              </h3>
              <Link
                to="/analytics"
                search={{ ns: ns || undefined }}
                className="text-xs text-kb-accent hover:underline"
              >
                See all
              </Link>
            </div>
            {stats.top_searches.length === 0 ? (
              <p className="px-5 py-6 text-sm text-kb-soft">
                No searches yet. They'll appear once Claude uses the MCP.
              </p>
            ) : (
              <ul className="divide-y divide-kb-line">
                {stats.top_searches.slice(0, 5).map((s) => (
                  <li
                    key={s.query}
                    className="flex items-center justify-between px-5 py-2.5"
                  >
                    <span className="truncate text-sm text-kb-ink">
                      {s.query}
                    </span>
                    <span className="ml-4 shrink-0 rounded-full bg-kb-accent/10 px-2 py-0.5 text-xs font-medium text-kb-accent">
                      {s.count}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Top viewed documents */}
          <div className="rounded-lg border border-kb-line bg-kb-panel">
            <div className="flex items-center justify-between border-b border-kb-line px-5 py-3">
              <h3 className="text-sm font-semibold text-kb-ink">
                Most Viewed Documents
              </h3>
              <Link
                to="/analytics"
                search={{ ns: ns || undefined }}
                className="text-xs text-kb-accent hover:underline"
              >
                See all
              </Link>
            </div>
            {stats.top_documents.length === 0 ? (
              <p className="px-5 py-6 text-sm text-kb-soft">
                No document views yet.
              </p>
            ) : (
              <ul className="divide-y divide-kb-line">
                {stats.top_documents.slice(0, 5).map((d) => (
                  <li
                    key={d.document_id}
                    className="flex items-center justify-between px-5 py-2.5"
                  >
                    <Link
                      to="/documents/$documentId"
                      params={{ documentId: d.document_id }}
                      search={{ ns: ns || undefined }}
                      className="truncate text-sm text-kb-accent hover:underline"
                    >
                      {d.document_title ?? d.document_id}
                    </Link>
                    <span className="ml-4 shrink-0 rounded-full bg-kb-accent/10 px-2 py-0.5 text-xs font-medium text-kb-accent">
                      {d.count}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: DashboardPage,
});
