'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

const ORDER = ['light', 'dark', 'system'] as const;
const LABELS: Record<(typeof ORDER)[number], string> = {
  light: 'מצב בהיר',
  dark: 'מצב לילה',
  system: 'לפי המכשיר',
};

const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const current = (mounted ? theme : 'system') as (typeof ORDER)[number];
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-fg transition-colors hover:border-border-strong hover:bg-subtle"
      aria-label={`${LABELS[current]} — לחיצה למעבר ל${LABELS[next]}`}
      title={LABELS[current]}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
