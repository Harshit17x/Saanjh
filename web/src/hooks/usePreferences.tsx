import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { readStored, writeStored } from '../lib/storage';

export type TextSize = 0 | 1 | 2;
export type Theme = 'light' | 'dark';

interface PreferencesValue {
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
  /** The theme in effect: the person's choice, or the system setting until they choose. */
  theme: Theme;
  toggleTheme: () => void;
  /** Speaks a message to screen readers through a polite live region. */
  announce: (message: string) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

const toSize = (value: string | null): TextSize => (value === '1' ? 1 : value === '2' ? 2 : 0);

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function initialTheme(): Theme {
  const stored = readStored('theme');
  return stored === 'light' || stored === 'dark' ? stored : systemTheme();
}

/** Text size and theme (remembered per device), and the app-wide screen-reader announcer. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [textSize, setTextSizeState] = useState<TextSize>(() => toSize(readStored('textSize')));
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [message, setMessage] = useState('');
  const clear = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    document.documentElement.dataset.textSize = String(textSize);
  }, [textSize]);

  const setTextSize = useCallback((size: TextSize) => {
    setTextSizeState(size);
    writeStored('textSize', String(size));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      writeStored('theme', next);
      return next;
    });
  }, []);

  const announce = useCallback((text: string) => {
    setMessage('');
    clearTimeout(clear.current);
    // A fresh node update makes screen readers announce repeated messages too.
    clear.current = setTimeout(() => setMessage(text), 50);
  }, []);

  const value = useMemo(
    () => ({ textSize, setTextSize, theme, toggleTheme, announce }),
    [textSize, setTextSize, theme, toggleTheme, announce],
  );
  return (
    <PreferencesContext.Provider value={value}>
      {children}
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </div>
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}
