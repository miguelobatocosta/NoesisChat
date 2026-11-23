import { useCallback, useEffect, useState } from 'react';

/** Keep in sync with public/theme-init.js, which applies the theme before first paint. */
export const THEME_STORAGE_KEY = 'pausa.theme';
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_PREFERENCES.includes(value as ThemePreference)
      ? (value as ThemePreference)
      : 'system';
  } catch {
    return 'system';
  }
}

function storePreference(pref: ThemePreference): void {
  try {
    if (pref === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

export function applyTheme(pref: ThemePreference): void {
  const dark = pref === 'dark' || (pref === 'system' && darkQuery().matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

/** Current preference plus a setter; follows OS changes live while on "system". */
export function useTheme(): [ThemePreference, (pref: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    applyTheme(pref);
    if (pref !== 'system') return;
    const query = darkQuery();
    const onChange = () => applyTheme('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [pref]);

  const update = useCallback((next: ThemePreference) => {
    storePreference(next);
    setPref(next);
  }, []);

  return [pref, update];
}
