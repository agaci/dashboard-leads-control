'use client';

import { useEffect, useState, useCallback } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'yb-theme';
const DEFAULT: Theme = 'light';

function applyTheme(t: Theme) {
  if (t === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(DEFAULT);

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Theme | null) ?? DEFAULT;
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(KEY, t);
    applyTheme(t);
  }, []);

  return { theme, setTheme };
}
