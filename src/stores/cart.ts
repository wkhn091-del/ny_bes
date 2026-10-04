'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * The browser keeps only identifiers and quantities. Prices are always recomputed: in the widget
 * for display from public catalog data, and on the server for the amount actually charged.
 */
export interface CartSelection {
  spaceId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  seats: number;
  isDayPass: boolean;
  addonIds: string[];
}

interface CartState {
  selection: CartSelection | null;
  setSelection: (selection: CartSelection | null) => void;
  clear: () => void;
}

const ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidSelection(value: unknown): value is CartSelection {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.spaceId === 'string' &&
    ID_RE.test(v.spaceId) &&
    typeof v.date === 'string' &&
    DATE_RE.test(v.date) &&
    Number.isInteger(v.startMinute) &&
    Number.isInteger(v.endMinute) &&
    Number.isInteger(v.seats) &&
    typeof v.isDayPass === 'boolean' &&
    Array.isArray(v.addonIds) &&
    v.addonIds.length <= 10 &&
    v.addonIds.every((id) => typeof id === 'string' && ID_RE.test(id))
  );
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      selection: null,
      setSelection: (selection) => set({ selection }),
      clear: () => set({ selection: null }),
    }),
    {
      name: 'spacehub-cart',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ selection: s.selection }),
      merge: (persisted, current) => {
        const selection = (persisted as { selection?: unknown } | undefined)?.selection;
        return { ...current, selection: isValidSelection(selection) ? selection : null };
      },
    },
  ),
);

export function checkoutHref(s: CartSelection): string {
  const p = new URLSearchParams({
    space: s.spaceId,
    date: s.date,
    start: String(s.startMinute),
    end: String(s.endMinute),
    seats: String(s.seats),
  });
  if (s.isDayPass) p.set('dayPass', '1');
  if (s.addonIds.length) p.set('addons', s.addonIds.join(','));
  return `/checkout?${p}`;
}
