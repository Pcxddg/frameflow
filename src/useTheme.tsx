import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark' | 'soft';

export const THEME_STORAGE_KEY = 'ff-theme';

const DEFAULT_THEME: Theme = 'light';
const VALID_THEMES: Theme[] = ['light', 'dark', 'soft'];

function isTheme(value: string | null): value is Theme {
  return value !== null && VALID_THEMES.includes(value as Theme);
}

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // Ignore storage failures and keep the app usable with a stable default.
  }

  return DEFAULT_THEME;
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

export function initializeTheme() {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => initializeTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures and keep the current in-memory theme.
    }
  }, [theme]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY) return;
      if (!isTheme(event.newValue)) return;
      setThemeState(event.newValue);
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider.');
  }
  return context;
}

export const THEME_META: Record<
  Theme,
  {
    label: string;
    description: string;
    icon: string;
    preview: {
      header: string;
      bg: string;
      card: string;
      accent: string;
      outline: string;
    };
  }
> = {
  light: {
    label: 'Claro',
    description: 'Crema calido, minimalista',
    icon: 'L',
    preview: {
      header: '#faf9f5',
      bg: '#faf9f5',
      card: '#ffffff',
      accent: '#d97757',
      outline: '#e8e6dc',
    },
  },
  dark: {
    label: 'Oscuro',
    description: 'Carbon profundo y legible',
    icon: 'D',
    preview: {
      header: '#141413',
      bg: '#141413',
      card: '#1f1e1c',
      accent: '#e89678',
      outline: '#2b2a27',
    },
  },
  soft: {
    label: 'Suave',
    description: 'Beige calido para la vista',
    icon: 'S',
    preview: {
      header: '#f0ece0',
      bg: '#f0ece0',
      card: '#f9f6ec',
      accent: '#c7643f',
      outline: '#d8d3c1',
    },
  },
};
