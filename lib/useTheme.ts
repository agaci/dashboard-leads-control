'use client';

import { useEffect, useState, useCallback } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'yb-theme';
const DEFAULT: Theme = 'light';

// Light theme overrides applied as inline styles on <html> — higher priority than any CSS rule.
// Dark theme: remove these overrides and let :root CSS defaults apply.
const LIGHT_VARS: Array<[string, string]> = [
  // ── Custom YB tokens ──────────────────────────────────────
  ['--yb-bg',      '#F1F5F9'],
  ['--yb-card',    '#FFFFFF'],
  ['--yb-card-2',  '#EBF0F7'],
  ['--yb-fg',      '#1a2b4a'],
  ['--yb-muted',   '#5a7394'],
  ['--yb-subtle',  '#94a3b8'],
  ['--yb-border',  'rgba(0,0,0,0.09)'],
  ['--yb-input',   'rgba(0,0,0,0.04)'],
  ['--yb-cyan',    '#0097a7'],
  ['--yb-success', '#16a34a'],
  ['--yb-error',   '#dc2626'],
  // ── Tailwind semantic tokens ───────────────────────────────
  ['--background',            '210 20% 97%'],
  ['--foreground',            '222 50% 19%'],
  ['--card',                  '0 0% 100%'],
  ['--card-foreground',       '222 50% 19%'],
  ['--popover',               '0 0% 100%'],
  ['--popover-foreground',    '222 50% 19%'],
  ['--primary',               '187 80% 38%'],
  ['--primary-foreground',    '0 0% 100%'],
  ['--secondary',             '210 35% 92%'],
  ['--secondary-foreground',  '222 50% 19%'],
  ['--muted',                 '210 35% 92%'],
  ['--muted-foreground',      '215 28% 44%'],
  ['--accent',                '210 30% 87%'],
  ['--accent-foreground',     '222 50% 19%'],
  ['--destructive',           '0 72% 51%'],
  ['--destructive-foreground','0 0% 100%'],
  ['--border',                '215 22% 82%'],
  ['--input',                 '215 22% 82%'],
  ['--ring',                  '187 80% 38%'],
  // ── Semantic colours ──────────────────────────────────────
  ['--cyan',         '187 80% 38%'],
  ['--cyan-soft',    '187 55% 90%'],
  ['--success',      '142 60% 35%'],
  ['--success-soft', '142 55% 90%'],
  ['--warning',      '38 85% 45%'],
  ['--warning-soft', '38 80% 90%'],
  ['--purple',       '262 70% 52%'],
  ['--purple-soft',  '262 55% 91%'],
  ['--orange',       '24 90% 48%'],
  ['--orange-soft',  '24 75% 90%'],
  ['--orange-warm',  '24 30% 92%'],
  // ── Sidebar ───────────────────────────────────────────────
  ['--sidebar-background',          '210 25% 93%'],
  ['--sidebar-foreground',          '222 50% 19%'],
  ['--sidebar-primary',             '187 80% 38%'],
  ['--sidebar-primary-foreground',  '0 0% 100%'],
  ['--sidebar-accent',              '210 30% 87%'],
  ['--sidebar-accent-foreground',   '222 50% 19%'],
  ['--sidebar-border',              '215 22% 80%'],
  ['--sidebar-ring',                '187 80% 38%'],
];

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'light') {
    root.setAttribute('data-theme', 'light');
    LIGHT_VARS.forEach(([k, v]) => root.style.setProperty(k, v));
  } else {
    root.removeAttribute('data-theme');
    LIGHT_VARS.forEach(([k]) => root.style.removeProperty(k));
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return DEFAULT;
    return (localStorage.getItem(KEY) as Theme | null) ?? DEFAULT;
  });

  useEffect(() => {
    // Apply on mount (synchronises with any FOUC script state)
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
