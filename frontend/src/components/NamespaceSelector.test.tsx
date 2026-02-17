import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createRouter,
  createRootRouteWithContext,
  createRoute,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";

import type { AppContext } from "@/context";
import { AppContextValue } from "@/context";
import NamespaceSelector from "./NamespaceSelector";

vi.mock("@/api", () => ({
  setNamespace: vi.fn(),
  reloadDatabase: vi.fn(() => Promise.resolve({ status: "ok" })),
}));

import { setNamespace, reloadDatabase } from "@/api";

const mockSetStatusMessage = vi.fn();
const mockFetchNamespaces = vi.fn();

function renderWithRouter(
  opts: { ns?: string; namespaces?: string[] } = {},
) {
  const { ns, namespaces = ["alpha", "beta", "gamma"] } = opts;
  const url = ns ? `/test?ns=${ns}` : "/test";

  const ctx: AppContext = {
    statusMessage: "Ready.",
    setStatusMessage: mockSetStatusMessage,
    theme: "light",
    setTheme: vi.fn(),
    namespaces,
    fetchNamespaces: mockFetchNamespaces,
  };

  const rootRoute = createRootRouteWithContext<AppContext>()({
    validateSearch: (search: Record<string, unknown>) => ({
      ns: typeof search.ns === "string" ? search.ns : undefined,
    }),
    component: () => (
      <AppContextValue.Provider value={ctx}>
        <NamespaceSelector />
      </AppContextValue.Provider>
    ),
  });

  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/test",
    component: () => <div data-testid="test-page">Test</div>,
  });

  const routeTree = rootRoute.addChildren([testRoute]);
  const history = createMemoryHistory({ initialEntries: [url] });
  const router = createRouter({ routeTree, history, context: ctx });

  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NamespaceSelector", () => {
  describe("pill button display", () => {
    it("shows 'default' when no namespace is active", async () => {
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });
    });

    it("shows current namespace name in pill", async () => {
      renderWithRouter({ ns: "alpha" });
      await waitFor(() => {
        expect(screen.getByText("alpha")).toBeInTheDocument();
      });
    });
  });

  describe("popover open/close", () => {
    it("opens popover with search input on click", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));

      expect(
        screen.getByPlaceholderText("Search namespaces..."),
      ).toBeInTheDocument();
    });

    it("closes popover on Escape key", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      expect(
        screen.getByPlaceholderText("Search namespaces..."),
      ).toBeInTheDocument();

      await user.keyboard("{Escape}");
      expect(
        screen.queryByPlaceholderText("Search namespaces..."),
      ).not.toBeInTheDocument();
    });

    it("closes popover on click outside", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      expect(
        screen.getByPlaceholderText("Search namespaces..."),
      ).toBeInTheDocument();

      // Click outside the component
      await user.click(document.body);
      await waitFor(() => {
        expect(
          screen.queryByPlaceholderText("Search namespaces..."),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("namespace list", () => {
    it("shows all namespaces plus default option", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));

      // "default" appears twice: once in pill, once in popover list
      const defaults = screen.getAllByText("default");
      expect(defaults.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("alpha")).toBeInTheDocument();
      expect(screen.getByText("beta")).toBeInTheDocument();
      expect(screen.getByText("gamma")).toBeInTheDocument();
    });

    it("filters namespaces as user types", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      await user.type(
        screen.getByPlaceholderText("Search namespaces..."),
        "alp",
      );

      expect(screen.getByText("alpha")).toBeInTheDocument();
      // beta and gamma should be filtered out of the list options
      // They might still appear elsewhere, so check within the popover
      const buttons = screen.getAllByRole("button");
      const buttonTexts = buttons.map((b) => b.textContent);
      expect(buttonTexts).not.toContain("beta");
      expect(buttonTexts).not.toContain("gamma");
    });

    it("filters case-insensitively", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      await user.type(
        screen.getByPlaceholderText("Search namespaces..."),
        "BETA",
      );

      expect(screen.getByText("beta")).toBeInTheDocument();
    });
  });

  describe("switching namespaces", () => {
    it("calls setNamespace and reloadDatabase when selecting a namespace", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      await user.click(screen.getByText("beta"));

      await waitFor(() => {
        expect(setNamespace).toHaveBeenCalledWith("beta");
        expect(reloadDatabase).toHaveBeenCalled();
        expect(mockFetchNamespaces).toHaveBeenCalled();
        expect(mockSetStatusMessage).toHaveBeenCalledWith(
          'Switched to namespace "beta".',
        );
      });
    });

    it("switches to default namespace", async () => {
      const user = userEvent.setup();
      renderWithRouter({ ns: "alpha" });
      await waitFor(() => {
        expect(screen.getByText("alpha")).toBeInTheDocument();
      });

      await user.click(screen.getByText("alpha"));
      // Click the "default" option in the popover (not the pill)
      const defaultButtons = screen.getAllByText("default");
      // The popover "default" is in the list
      await user.click(defaultButtons[defaultButtons.length - 1]);

      await waitFor(() => {
        expect(setNamespace).toHaveBeenCalledWith("");
        expect(mockSetStatusMessage).toHaveBeenCalledWith(
          "Switched to default namespace.",
        );
      });
    });

    it("closes popover after selecting a namespace", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      expect(
        screen.getByPlaceholderText("Search namespaces..."),
      ).toBeInTheDocument();

      await user.click(screen.getByText("alpha"));

      await waitFor(() => {
        expect(
          screen.queryByPlaceholderText("Search namespaces..."),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("creating new namespaces", () => {
    it("shows create option when query doesn't match any namespace", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      await user.type(
        screen.getByPlaceholderText("Search namespaces..."),
        "newproject",
      );

      expect(screen.getByText(/Create "newproject"/)).toBeInTheDocument();
    });

    it("does not show create option when query matches an existing namespace", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      await user.type(
        screen.getByPlaceholderText("Search namespaces..."),
        "alpha",
      );

      expect(screen.queryByText(/Create "alpha"/)).not.toBeInTheDocument();
    });

    it("does not show create option for case-variant of existing namespace", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      await user.type(
        screen.getByPlaceholderText("Search namespaces..."),
        "Alpha",
      );

      expect(screen.queryByText(/Create "Alpha"/)).not.toBeInTheDocument();
    });

    it("switches to new namespace when clicking create button", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      await user.type(
        screen.getByPlaceholderText("Search namespaces..."),
        "newproject",
      );
      await user.click(screen.getByText(/Create "newproject"/));

      await waitFor(() => {
        expect(setNamespace).toHaveBeenCalledWith("newproject");
        expect(reloadDatabase).toHaveBeenCalled();
        expect(mockFetchNamespaces).toHaveBeenCalled();
        expect(mockSetStatusMessage).toHaveBeenCalledWith(
          'Switched to namespace "newproject".',
        );
      });
    });

    it("does not show create option for empty/whitespace query", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      await user.type(
        screen.getByPlaceholderText("Search namespaces..."),
        "   ",
      );

      expect(screen.queryByText(/Create/)).not.toBeInTheDocument();
    });
  });

  describe("keyboard interactions", () => {
    it("switches to single filtered result on Enter", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      await user.type(
        screen.getByPlaceholderText("Search namespaces..."),
        "gamma",
      );
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(setNamespace).toHaveBeenCalledWith("gamma");
      });
    });

    it("creates namespace on Enter when query is novel", async () => {
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      await user.type(
        screen.getByPlaceholderText("Search namespaces..."),
        "brandnew",
      );
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(setNamespace).toHaveBeenCalledWith("brandnew");
      });
    });

    it("does not switch when Enter is pressed with multiple matches", async () => {
      const user = userEvent.setup();
      renderWithRouter({ namespaces: ["alpha", "alpha-two"] });
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      await user.type(
        screen.getByPlaceholderText("Search namespaces..."),
        "alpha",
      );
      await user.keyboard("{Enter}");

      // "alpha" is an exact match, so no create option; but there are 2 filtered results
      // so Enter should not trigger switch
      expect(setNamespace).not.toHaveBeenCalled();
    });
  });

  describe("empty state", () => {
    it("shows only default when no namespaces exist", async () => {
      const user = userEvent.setup();
      renderWithRouter({ namespaces: [] });
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));

      const buttons = screen
        .getAllByRole("button")
        .filter((b) => b.textContent === "default");
      // One in the pill, one in the list
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it("offers to create when typing in empty namespace list", async () => {
      const user = userEvent.setup();
      renderWithRouter({ namespaces: [] });
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      await user.type(
        screen.getByPlaceholderText("Search namespaces..."),
        "first",
      );

      expect(screen.getByText(/Create "first"/)).toBeInTheDocument();
    });
  });

  describe("error resilience", () => {
    it("still switches namespace when reloadDatabase fails", async () => {
      vi.mocked(reloadDatabase).mockRejectedValueOnce(
        new Error("network error"),
      );
      const user = userEvent.setup();
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText("default")).toBeInTheDocument();
      });

      await user.click(screen.getByText("default"));
      await user.click(screen.getByText("alpha"));

      await waitFor(() => {
        expect(setNamespace).toHaveBeenCalledWith("alpha");
        expect(mockFetchNamespaces).toHaveBeenCalled();
      });
    });
  });
});
