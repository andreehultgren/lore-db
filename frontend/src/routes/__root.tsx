import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { listNamespaces, reloadDatabase, setNamespace } from "@/api";
import { type AppContext, AppContextValue, type ThemeMode } from "@/context";
import LightDarkModeButton from "@/components/LightDarkModeButton";
import NamespaceSelector from "@/components/NamespaceSelector";

type SearchParams = { ns?: string };

function RootLayout(): JSX.Element {
  const [statusMessage, setStatusMessage] = useState<string>("Ready.");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [namespaces, setNamespaces] = useState<string[]>([]);

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
                Knowledge Database
              </p>
              <h1 className="mt-1 text-xl font-semibold">LORE DB</h1>
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

            <div className="mt-auto border-t border-slate-800 px-3 py-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <NamespaceSelector />
              </div>
              <LightDarkModeButton
                value={themeMode}
                onToggle={(mode) => setThemeMode(mode)}
              />
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
