import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import {
  getAnalyticsStats,
  getAnalyticsEvents,
  type AnalyticsStats,
  type AnalyticsEvent,
} from "@/api";
import { useAppContext } from "@/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EVENT_TYPE_LABELS: Record<string, string> = {
  search: "Search",
  get_document: "View Doc",
  list_documents: "List Docs",
  create_document: "Create Doc",
  update_document: "Update Doc",
  delete_document: "Delete Doc",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  search: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  get_document:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  list_documents:
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  create_document:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  update_document:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  delete_document:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

function EventTypeBadge({ type }: { type: string }) {
  const label = EVENT_TYPE_LABELS[type] ?? type;
  const color =
    EVENT_TYPE_COLORS[type] ??
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${color}`}
    >
      {label}
    </span>
  );
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

const PAGE_SIZE = 25;

function AnalyticsPage(): JSX.Element {
  const { setStatusMessage } = useAppContext();
  const { ns } = Route.useSearch();

  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [eventTypeFilter, setEventTypeFilter] = useState<string>("");
  const [queryFilter, setQueryFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const filteredEvents = useMemo(() => {
    if (!queryFilter.trim()) return events;
    const q = queryFilter.trim().toLowerCase();
    return events.filter(
      (e) =>
        e.query?.toLowerCase().includes(q) ||
        e.document_title?.toLowerCase().includes(q) ||
        e.event_type.includes(q),
    );
  }, [events, queryFilter]);

  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));

  useEffect(() => {
    void loadStats();
  }, [ns]);

  useEffect(() => {
    void loadEvents();
  }, [ns, eventTypeFilter, page]);

  async function loadStats(): Promise<void> {
    try {
      setLoading(true);
      const s = await getAnalyticsStats(ns || undefined);
      setStats(s);
    } catch (error: unknown) {
      setStatusMessage(
        `Failed to load analytics: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents(): Promise<void> {
    try {
      setEventsLoading(true);
      const result = await getAnalyticsEvents({
        namespace: ns || undefined,
        event_type: eventTypeFilter || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setEvents(result.events);
      setTotalEvents(result.total);
    } catch (error: unknown) {
      setStatusMessage(
        `Failed to load events: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setEventsLoading(false);
    }
  }

  function onEventTypeChange(type: string) {
    setEventTypeFilter(type);
    setPage(1);
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-kb-ink">MCP Analytics</h2>
        <p className="mt-1 text-sm text-kb-soft">
          Track how Claude uses your knowledge base via MCP
          {ns ? ` — namespace: ${ns}` : ""}
        </p>
      </div>

      {/* Overview cards */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries(EVENT_TYPE_LABELS).map(([type, label]) => {
          const count = stats?.events_by_type[type] ?? 0;
          return (
            <button
              key={type}
              type="button"
              onClick={() =>
                onEventTypeChange(eventTypeFilter === type ? "" : type)
              }
              className={`rounded-lg border px-4 py-3 text-left transition ${
                eventTypeFilter === type
                  ? "border-kb-accent bg-kb-accent/5"
                  : "border-kb-line bg-kb-panel hover:border-kb-accent/40"
              }`}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-kb-soft">
                {label}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-kb-ink">
                {loading ? "—" : count}
              </p>
            </button>
          );
        })}
      </div>

      {/* Top searches + Top documents */}
      {!loading && stats && (
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Top searches */}
          <div className="rounded-lg border border-kb-line bg-kb-panel">
            <div className="border-b border-kb-line px-5 py-3">
              <h3 className="text-sm font-semibold text-kb-ink">
                Top Search Queries
              </h3>
              <p className="mt-0.5 text-xs text-kb-soft">
                What Claude searches for most
              </p>
            </div>
            {stats.top_searches.length === 0 ? (
              <p className="px-5 py-6 text-sm text-kb-soft">
                No searches recorded yet.
              </p>
            ) : (
              <ul className="divide-y divide-kb-line">
                {stats.top_searches.map((s, i) => (
                  <li
                    key={s.query}
                    className="flex items-center gap-3 px-5 py-2.5"
                  >
                    <span className="w-5 shrink-0 text-center text-xs font-semibold text-kb-soft">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate text-sm text-kb-ink">
                      {s.query}
                    </span>
                    <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {s.count}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Top viewed documents */}
          <div className="rounded-lg border border-kb-line bg-kb-panel">
            <div className="border-b border-kb-line px-5 py-3">
              <h3 className="text-sm font-semibold text-kb-ink">
                Most Viewed Documents
              </h3>
              <p className="mt-0.5 text-xs text-kb-soft">
                Documents Claude reads most often
              </p>
            </div>
            {stats.top_documents.length === 0 ? (
              <p className="px-5 py-6 text-sm text-kb-soft">
                No document views recorded yet.
              </p>
            ) : (
              <ul className="divide-y divide-kb-line">
                {stats.top_documents.map((d, i) => (
                  <li
                    key={d.document_id}
                    className="flex items-center gap-3 px-5 py-2.5"
                  >
                    <span className="w-5 shrink-0 text-center text-xs font-semibold text-kb-soft">
                      {i + 1}
                    </span>
                    <Link
                      to="/documents/$documentId"
                      params={{ documentId: d.document_id }}
                      search={{ ns: ns || undefined }}
                      className="flex-1 truncate text-sm text-kb-accent hover:underline"
                    >
                      {d.document_title ?? d.document_id}
                    </Link>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      {d.count}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Event log */}
      <div className="rounded-lg border border-kb-line bg-kb-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-kb-line px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-kb-ink">Event Log</h3>
            <p className="mt-0.5 text-xs text-kb-soft">
              {totalEvents} event{totalEvents !== 1 ? "s" : ""}
              {eventTypeFilter ? ` · filtered by ${EVENT_TYPE_LABELS[eventTypeFilter] ?? eventTypeFilter}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={queryFilter}
              onChange={(e) => setQueryFilter(e.target.value)}
              placeholder="Filter by query or title..."
              className="h-8 w-52 text-sm"
            />
            {eventTypeFilter && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEventTypeChange("")}
              >
                Clear filter
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-kb-line bg-slate-50 dark:bg-kb-bg/60">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-kb-soft">
                  Time
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-kb-soft">
                  Type
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-kb-soft">
                  Namespace
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-kb-soft">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {eventsLoading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-kb-soft"
                  >
                    Loading…
                  </td>
                </tr>
              ) : filteredEvents.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-kb-soft"
                  >
                    No events yet. Events appear once Claude uses the MCP tools.
                  </td>
                </tr>
              ) : (
                filteredEvents.map((event) => (
                  <tr
                    key={event.id}
                    className="border-t border-kb-line hover:bg-kb-accent/5"
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-xs tabular-nums text-kb-soft">
                      {formatTimestamp(event.timestamp)}
                    </td>
                    <td className="px-4 py-2">
                      <EventTypeBadge type={event.event_type} />
                    </td>
                    <td className="px-4 py-2 text-xs text-kb-soft">
                      {event.namespace || (
                        <span className="italic">default</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-kb-ink">
                      {event.query && (
                        <span>
                          <span className="text-kb-soft">query: </span>
                          <span className="font-medium">{event.query}</span>
                          {event.result_count !== null && (
                            <span className="ml-2 text-xs text-kb-soft">
                              ({event.result_count} result
                              {event.result_count !== 1 ? "s" : ""})
                            </span>
                          )}
                        </span>
                      )}
                      {event.document_title && (
                        <Link
                          to="/documents/$documentId"
                          params={{ documentId: event.document_id ?? "" }}
                          search={{ ns: ns || undefined }}
                          className="text-kb-accent hover:underline"
                        >
                          {event.document_title}
                        </Link>
                      )}
                      {!event.query && !event.document_title && (
                        <span className="text-kb-soft italic">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-kb-line px-5 py-3">
            <p className="text-xs text-kb-soft">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/analytics")({
  component: AnalyticsPage,
});
