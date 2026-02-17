import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { listNamespaces, reloadDatabase, setNamespace } from "@/api";
import { type AppContext, AppContextValue, type ThemeMode } from "@/context";

type SearchParams = { ns?: string };

function SunIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 1 0 11.5 11.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function RootLayout(): JSX.Element {
  const [statusMessage, setStatusMessage] = useState<string>("Ready.");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [nsInput, setNsInput] = useState<string>("");

  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentNs = (routerState.location.search as SearchParams).ns ?? "";

  async function fetchNamespaces(): Promise<void> {
    try {
      const ns = await listNamespaces();
      setNamespaces(ns);
    } catch {
      // Ignore if endpoint is unavailable.
    }
  }

  useEffect(() => {
    const stored = window.localStorage.getItem("kb-theme");
    if (stored === "dark" || stored === "light") {
      setThemeMode(stored);
      return;
    }
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    setThemeMode(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    window.localStorage.setItem("kb-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    void initializeApp();
  }, []);

  async function initializeApp(): Promise<void> {
    try {
      await reloadDatabase();
    } catch {
      // Ignore startup reload failures.
    }
    await fetchNamespaces();
  }

  const appContext: AppContext = {
    statusMessage,
    setStatusMessage,
    theme: themeMode,
    setTheme: setThemeMode,
    namespaces,
    fetchNamespaces,
  };

  const navItems = [
    { to: "/documents" as const, label: "Documents" },
    { to: "/search" as const, label: "Search" },
    { to: "/settings" as const, label: "Settings" },
  ];

  return (
    <AppContextValue.Provider value={appContext}>
      <div className="page-shell">
        <div className="grid min-h-screen lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Sidebar */}
          <aside className="flex flex-col border-r border-kb-line bg-slate-950 text-slate-100">
            <div className="border-b border-slate-800 px-4 py-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
                Vector MCP
              </p>
              <h1 className="mt-1 text-xl font-semibold">Knowledge Admin</h1>
            </div>

            <div className="border-b border-slate-800 px-3 py-3">
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-slate-500">
                Namespace
              </label>
              <select
                value={currentNs}
                onChange={(event) => {
                  const ns = event.target.value;
                  void switchNamespace(ns);
                }}
                className="mb-2 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 outline-none focus:border-kb-accent"
              >
                <option value="">(default)</option>
                {namespaces.map((ns) => (
                  <option key={ns} value={ns}>
                    {ns}
                  </option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={nsInput}
                  onChange={(event) => setNsInput(event.target.value)}
                  placeholder="new-namespace"
                  className="h-7 min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-kb-accent"
                />
                <button
                  type="button"
                  className="shrink-0 rounded bg-slate-800 px-2 text-[11px] font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                  disabled={!nsInput.trim()}
                  onClick={() => {
                    const value = nsInput.trim();
                    if (value) {
                      setNsInput("");
                      void switchNamespace(value);
                    }
                  }}
                >
                  Go
                </button>
              </div>
            </div>

            <nav className="space-y-1 px-3 py-3">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  search={{ ns: currentNs || undefined }}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition text-slate-300 hover:bg-slate-900 hover:text-white"
                  activeProps={{
                    className:
                      "block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition bg-slate-800 text-white",
                  }}
                  activeOptions={{ includeSearch: false }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto border-t border-slate-800 p-3">
              <button
                type="button"
                className="relative inline-flex h-9 w-full items-center rounded-md border border-slate-700 bg-slate-900 px-1.5 text-slate-300"
                onClick={() =>
                  setThemeMode((value) =>
                    value === "light" ? "dark" : "light",
                  )
                }
                aria-label={`Switch to ${themeMode === "light" ? "dark" : "light"} mode`}
                title={`Switch to ${themeMode === "light" ? "dark" : "light"} mode`}
              >
                <span className="absolute left-2.5">
                  <SunIcon />
                </span>
                <span className="absolute right-2.5">
                  <MoonIcon />
                </span>
                <span
                  className={`absolute top-[3px] flex h-7 w-7 items-center justify-center rounded bg-kb-accent text-white transition-all ${
                    themeMode === "light" ? "left-[3px]" : "right-[3px]"
                  }`}
                >
                  {themeMode === "light" ? <SunIcon /> : <MoonIcon />}
                </span>
              </button>
            </div>
          </aside>

          {/* Main content */}
          <section className="flex min-h-0 flex-col bg-kb-bg">
            {/* Status bar */}
            <div className="border-b border-kb-line bg-kb-panel/80 px-6 py-2 font-mono text-xs text-kb-soft">
              {statusMessage}
            </div>

            {/* Content area */}
            <div className="min-h-0 flex-1 overflow-auto">
              <Outlet />
            </div>
          </section>
        </div>
      </div>
    </AppContextValue.Provider>
  );

  async function switchNamespace(ns: string): Promise<void> {
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

export const Route = createRootRouteWithContext<AppContext>()({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    ns: typeof search.ns === "string" ? search.ns : undefined,
  }),
  beforeLoad: ({ search }) => {
    const ns = (search as SearchParams).ns ?? "";
    setNamespace(ns);
  },
  component: RootLayout,
});
