import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";

type AppearanceState = {
  theme: Theme;
  compact: boolean;
  reducedMotion: boolean;
  setTheme: (t: Theme) => void;
  setCompact: (v: boolean) => void;
  setReducedMotion: (v: boolean) => void;
};

const STORAGE_KEY = "upsilon.appearance.v1";

const AppearanceContext = createContext<AppearanceState | null>(null);

type Persisted = { theme: Theme; compact: boolean; reducedMotion: boolean };

const defaults: Persisted = {
  theme: "system",
  compact: false,
  reducedMotion: false,
};

function readPersisted(): Persisted {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      theme: parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system" ? parsed.theme : defaults.theme,
      compact: typeof parsed.compact === "boolean" ? parsed.compact : defaults.compact,
      reducedMotion: typeof parsed.reducedMotion === "boolean" ? parsed.reducedMotion : defaults.reducedMotion,
    };
  } catch {
    return defaults;
  }
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
}

function applyClass(name: string, on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(name, on);
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(defaults);

  // Hydrate from localStorage on mount (avoids SSR mismatch)
  useEffect(() => {
    const persisted = readPersisted();
    setState(persisted);
    applyTheme(persisted.theme);
    applyClass("compact", persisted.compact);
    applyClass("reduced-motion", persisted.reducedMotion);
  }, []);

  // React to OS theme changes when in "system" mode
  useEffect(() => {
    if (state.theme !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [state.theme]);

  const persist = (next: Persisted) => {
    setState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const value: AppearanceState = {
    ...state,
    setTheme: (theme) => {
      persist({ ...state, theme });
      applyTheme(theme);
    },
    setCompact: (compact) => {
      persist({ ...state, compact });
      applyClass("compact", compact);
    },
    setReducedMotion: (reducedMotion) => {
      persist({ ...state, reducedMotion });
      applyClass("reduced-motion", reducedMotion);
    },
  };

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceState {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    // Safe fallback so the app never crashes if used outside provider.
    return {
      theme: "system",
      compact: false,
      reducedMotion: false,
      setTheme: () => {},
      setCompact: () => {},
      setReducedMotion: () => {},
    };
  }
  return ctx;
}
