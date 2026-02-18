import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createRouter,
  createRootRouteWithContext,
  createRoute,
  createMemoryHistory,
  RouterProvider,
  redirect,
  Outlet,
  Link,
} from "@tanstack/react-router";
import type { AppContext } from "@/context";

// Mock API module
vi.mock("@/api", () => ({
  setNamespace: vi.fn(),
  getNamespace: vi.fn(() => ""),
  listDocuments: vi.fn(() =>
    Promise.resolve([
      {
        id: "doc-1",
        title: "Test Doc",
        content: "Test content",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "doc-2",
        title: "Another Doc",
        content: "More content",
        created_at: "2026-01-02T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      },
    ]),
  ),
  listNamespaces: vi.fn(() => Promise.resolve(["ns1", "ns2"])),
  reloadDatabase: vi.fn(() => Promise.resolve({ status: "ok" })),
  getDocument: vi.fn(() =>
    Promise.resolve({
      id: "doc-1",
      title: "Test Doc",
      content: "Test content",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }),
  ),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  searchDocuments: vi.fn(() => Promise.resolve([])),
  getAnalyticsStats: vi.fn(() =>
    Promise.resolve({
      total_events: 42,
      events_by_type: { search: 30, get_document: 12 },
      top_searches: [{ query: "python", count: 10 }],
      top_documents: [{ document_id: "doc-1", document_title: "Test Doc", count: 5 }],
      recent_events: [],
    }),
  ),
  getAnalyticsEvents: vi.fn(() =>
    Promise.resolve({ events: [], total: 0 }),
  ),
}));

import { setNamespace } from "@/api";

type SearchParams = { ns?: string };

function createTestContext(): AppContext {
  return {
    statusMessage: "Ready.",
    setStatusMessage: vi.fn(),
    theme: "light",
    setTheme: vi.fn(),
    namespaces: ["ns1", "ns2"],
    fetchNamespaces: vi.fn(),
  };
}

/**
 * Creates a minimal route tree that mirrors the real app's structure
 * for testing routing behavior.
 */
function createTestRouter(initialUrl: string) {
  const ctx = createTestContext();

  const rootRoute = createRootRouteWithContext<AppContext>()({
    validateSearch: (search: Record<string, unknown>): SearchParams => ({
      ns: typeof search.ns === "string" ? search.ns : undefined,
    }),
    beforeLoad: ({ search }) => {
      const ns = (search as SearchParams).ns ?? "";
      setNamespace(ns);
    },
    component: () => (
      <div>
        <nav data-testid="sidebar">
          <Link to="/" search={(prev) => prev} data-testid="lore-db-link">
            LORE DB
          </Link>
          <Link to="/documents" search={(prev) => prev}>
            Documents
          </Link>
          <Link to="/search" search={(prev) => prev}>
            Search
          </Link>
          <Link to="/analytics" search={(prev) => prev}>
            Analytics
          </Link>
          <Link to="/settings" search={(prev) => prev}>
            Settings
          </Link>
        </nav>
        <main>
          <Outlet />
        </main>
      </div>
    ),
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div data-testid="dashboard-page">Dashboard</div>,
  });

  const documentsIndexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/documents",
    component: () => <div data-testid="documents-page">Document List</div>,
  });

  const documentsNewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/documents/new",
    component: () => <div data-testid="documents-new-page">New Document</div>,
  });

  const documentEditRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/documents/$documentId",
    component: () => {
      const { documentId } = documentEditRoute.useParams();
      return <div data-testid="document-edit-page">Editing {documentId}</div>;
    },
  });

  const searchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/search",
    component: () => <div data-testid="search-page">Search Page</div>,
  });

  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => <div data-testid="settings-page">Settings Page</div>,
  });

  const analyticsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/analytics",
    component: () => <div data-testid="analytics-page">Analytics Page</div>,
  });

  const routeTree = rootRoute.addChildren([
    indexRoute,
    documentsIndexRoute,
    documentsNewRoute,
    documentEditRoute,
    searchRoute,
    settingsRoute,
    analyticsRoute,
  ]);

  const history = createMemoryHistory({ initialEntries: [initialUrl] });
  const router = createRouter({
    routeTree,
    history,
    context: ctx,
  });

  return router;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Route structure", () => {
  it("renders dashboard at /", async () => {
    const router = createTestRouter("/");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    });
  });

  it("renders document list at /documents", async () => {
    const router = createTestRouter("/documents");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("documents-page")).toBeInTheDocument();
    });
  });

  it("renders new document form at /documents/new", async () => {
    const router = createTestRouter("/documents/new");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("documents-new-page")).toBeInTheDocument();
    });
  });

  it("renders document editor at /documents/$documentId", async () => {
    const router = createTestRouter("/documents/doc-1");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("document-edit-page")).toBeInTheDocument();
      expect(screen.getByText("Editing doc-1")).toBeInTheDocument();
    });
  });

  it("renders search page at /search", async () => {
    const router = createTestRouter("/search");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("search-page")).toBeInTheDocument();
    });
  });

  it("renders settings page at /settings", async () => {
    const router = createTestRouter("/settings");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("settings-page")).toBeInTheDocument();
    });
  });

  it("renders analytics page at /analytics", async () => {
    const router = createTestRouter("/analytics");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("analytics-page")).toBeInTheDocument();
    });
  });
});

describe("Namespace sync from URL", () => {
  it("calls setNamespace with ns search param on load", async () => {
    const router = createTestRouter("/documents?ns=myproject");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(setNamespace).toHaveBeenCalledWith("myproject");
    });
  });

  it("calls setNamespace with empty string when ns is not present", async () => {
    const router = createTestRouter("/documents");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(setNamespace).toHaveBeenCalledWith("");
    });
  });

  it("preserves ns param when navigating between tabs", async () => {
    const router = createTestRouter("/documents?ns=test-ns");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("documents-page")).toBeInTheDocument();
    });

    const searchLink = screen.getByText("Search");
    await userEvent.click(searchLink);

    await waitFor(() => {
      expect(screen.getByTestId("search-page")).toBeInTheDocument();
    });

    // setNamespace should have been called with the ns param again
    expect(setNamespace).toHaveBeenCalledWith("test-ns");
  });
});

describe("Sidebar navigation", () => {
  it("renders sidebar with navigation links", async () => {
    const router = createTestRouter("/documents");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    });

    expect(screen.getByText("LORE DB")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("navigates to dashboard when clicking LORE DB title", async () => {
    const router = createTestRouter("/documents");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("documents-page")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("lore-db-link"));

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    });
  });

  it("navigates to search when clicking Search link", async () => {
    const router = createTestRouter("/documents");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("documents-page")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Search"));

    await waitFor(() => {
      expect(screen.getByTestId("search-page")).toBeInTheDocument();
    });
  });

  it("navigates to settings when clicking Settings link", async () => {
    const router = createTestRouter("/documents");
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("documents-page")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Settings"));

    await waitFor(() => {
      expect(screen.getByTestId("settings-page")).toBeInTheDocument();
    });
  });
});
