import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'system' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'vonta.ui.theme';
const CHANGE_EVENT = 'vonta:theme-change';

export function readStoredTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'light';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'system' || raw === 'dark') {
      return raw;
    }
  } catch {
    // Ignore storage read errors
  }
  return 'light';
}

export function resolveThemeChoice(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'dark') return 'dark';
  if (choice === 'light') return 'light';
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

export function applyThemeChoice(choice: ThemeChoice): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Ignore storage write errors
  }
  const resolved = resolveThemeChoice(choice);
  document.documentElement.dataset.themeChoice = choice;
  document.documentElement.dataset.theme = resolved;
  window.dispatchEvent(new CustomEvent<ThemeChoice>(CHANGE_EVENT, { detail: choice }));
  return resolved;
}

export function formatThemeLabel(choice: ThemeChoice): string {
  switch (choice) {
    case 'system':
      return 'System';
    case 'dark':
      return 'Dark';
    case 'light':
    default:
      return 'Light';
  }
}

export function useThemePreference(): {
  theme: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  setTheme: (next: ThemeChoice) => void;
} {
  const [theme, setThemeState] = useState<ThemeChoice>(() => readStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveThemeChoice(readStoredTheme())
  );

  useEffect(() => {
    const applied = applyThemeChoice(theme);
    setResolvedTheme(applied);

    const onCustomChange = (e: Event) => {
      const detail = (e as CustomEvent<ThemeChoice>).detail;
      if (detail === 'light' || detail === 'system' || detail === 'dark') {
        setThemeState(detail);
        setResolvedTheme(resolveThemeChoice(detail));
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const next = readStoredTheme();
        setThemeState(next);
        setResolvedTheme(applyThemeChoice(next));
      }
    };

    const mediaQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    const onMediaChange = () => {
      const current = readStoredTheme();
      if (current === 'system') {
        const nextResolved = resolveThemeChoice('system');
        document.documentElement.dataset.theme = nextResolved;
        setResolvedTheme(nextResolved);
      }
    };

    window.addEventListener(CHANGE_EVENT, onCustomChange);
    window.addEventListener('storage', onStorage);
    mediaQuery?.addEventListener?.('change', onMediaChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onCustomChange);
      window.removeEventListener('storage', onStorage);
      mediaQuery?.removeEventListener?.('change', onMediaChange);
    };
  }, [theme]);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    setResolvedTheme(applyThemeChoice(next));
  }, []);

  return { theme, resolvedTheme, setTheme };
}
