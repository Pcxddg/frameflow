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
    label: 'Light',
    description: 'Luminoso y profesional',
    icon: 'L',
    preview: {
      header: '#2563eb',
      bg: '#f1f5f9',
      card: '#ffffff',
      accent: '#6366f1',
      outline: '#dbe3ee',
    },
  },
  dark: {
    label: 'Dark',
    description: 'Oscuro neutro y legible',
    icon: 'D',
    preview: {
      header: '#161b22',
      bg: '#111418',
      card: '#1a1f26',
      accent: '#5b8cff',
      outline: '#2e3640',
    },
  },
  soft: {
    label: 'Soft',
    description: 'Suave para la vista',
    icon: 'S',
    preview: {
      header: '#047857',
      bg: '#faf7f2',
      card: '#fffdf8',
      accent: '#10b981',
      outline: '#e5dfd5',
    },
  },
};
