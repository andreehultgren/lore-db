import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { reloadDatabase, setNamespace } from "@/api";
import { useAppContext } from "@/context";

type SearchParams = { ns?: string };

function NamespaceSelector(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { namespaces, fetchNamespaces, setStatusMessage } = useAppContext();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentNs =
    (routerState.location.search as SearchParams).ns ?? "";

  const filtered = namespaces.filter((ns) =>
    ns.toLowerCase().includes(query.toLowerCase()),
  );
  const exactMatch =
    namespaces.some((ns) => ns.toLowerCase() === query.trim().toLowerCase());
  const showCreate = query.trim() && !exactMatch;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 text-xs text-slate-300 transition hover:border-slate-600 hover:text-slate-100"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3 w-3 shrink-0 text-slate-500"
        >
          <title>Namespace</title>
          <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h2.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 4H12.5A1.5 1.5 0 0 1 14 5.5v1.401a2.986 2.986 0 0 0-1.5-.401h-9A2.986 2.986 0 0 0 2 6.901V3.5Z" />
          <path d="M3.5 8A1.5 1.5 0 0 0 2 9.5v3A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-3A1.5 1.5 0 0 0 12.5 8h-9Z" />
        </svg>
        <span className="flex-1 truncate text-left">
          {currentNs || "default"}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3 w-3 shrink-0 text-slate-500"
        >
          <title>Toggle</title>
          <path
            fillRule="evenodd"
            d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-52 rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (showCreate) {
                    void doSwitch(query.trim());
                  } else if (filtered.length === 1) {
                    void doSwitch(filtered[0]);
                  }
                }
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="Search namespaces..."
              className="h-7 w-full rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-slate-600"
            />
          </div>
          <div className="max-h-40 overflow-y-auto px-1 pb-1">
            <button
              type="button"
              onClick={() => void doSwitch("")}
              className={`flex w-full items-center rounded px-2 py-1.5 text-left text-xs transition ${
                currentNs === ""
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              default
            </button>
            {filtered.map((ns) => (
              <button
                key={ns}
                type="button"
                onClick={() => void doSwitch(ns)}
                className={`flex w-full items-center rounded px-2 py-1.5 text-left text-xs transition ${
                  currentNs === ns
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {ns}
              </button>
            ))}
            {showCreate && (
              <button
                type="button"
                onClick={() => void doSwitch(query.trim())}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-kb-accent transition hover:bg-slate-800"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3 w-3"
                >
                  <title>Create</title>
                  <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                </svg>
                Create "{query.trim()}"
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  async function doSwitch(ns: string): Promise<void> {
    setOpen(false);
    setNamespace(ns);
    setStatusMessage(
      ns ? `Switched to namespace "${ns}".` : "Switched to default namespace.",
    );
    try {
      await reloadDatabase();
    } catch {
      // Ignore reload failures.
    }
    await fetchNamespaces();
    void navigate({ search: { ns: ns || undefined } });
  }
}

export default NamespaceSelector;
