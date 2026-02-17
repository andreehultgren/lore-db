import { createContext, useContext } from "react";

export type ThemeMode = "light" | "dark";

export interface AppContext {
  statusMessage: string;
  setStatusMessage: (msg: string) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  namespaces: string[];
  fetchNamespaces: () => Promise<void>;
}

export const AppContextValue = createContext<AppContext | null>(null);

export function useAppContext(): AppContext {
  const ctx = useContext(AppContextValue);
  if (!ctx) {
    throw new Error("useAppContext must be used within AppContextValue.Provider");
  }
  return ctx;
}
