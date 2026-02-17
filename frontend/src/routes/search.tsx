import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { searchDocuments, type SearchHit } from "@/api";
import { useAppContext } from "@/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function SearchPage(): JSX.Element {
  const { setStatusMessage } = useAppContext();
  const { ns } = Route.useSearch();

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchLimit, setSearchLimit] = useState<number>(10);
  const [searching, setSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);

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
      setStatusMessage(
        `Search failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="p-6">
      <h2 className="mb-6 text-xl font-semibold text-kb-ink">Search</h2>

      <div className="space-y-4">
        <form
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_140px]"
          onSubmit={(event) => void onRunSearch(event)}
        >
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
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-kb-soft">
                  Title
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-kb-soft">
                  Score
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-kb-soft">
                  Preview
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-kb-soft">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {searchResults.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-kb-soft"
                  >
                    No results yet.
                  </td>
                </tr>
              ) : (
                searchResults.map((result) => (
                  <tr
                    key={result.id}
                    className="border-t border-kb-line transition hover:bg-kb-accent/5"
                  >
                    <td className="px-4 py-2.5 align-top font-medium text-kb-ink">
                      {result.title}
                    </td>
                    <td className="px-4 py-2.5 align-top tabular-nums text-kb-soft">
                      {result.score.toFixed(3)}
                    </td>
                    <td className="px-4 py-2.5 align-top text-kb-soft">
                      {result.content_preview}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        <Link
                          to="/documents/$documentId"
                          params={{ documentId: result.id }}
                          search={{ ns: ns || undefined }}
                        >
                          <Button size="sm" variant="outline">
                            Open
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/search")({
  component: SearchPage,
});
