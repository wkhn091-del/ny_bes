'use client';

import { create } from 'zustand';

/**
 * Display-only snapshot of the signed-in user for the Navbar and account chrome.
 * Never persisted and never trusted: every private page and action re-checks the session on the server.
 */
export interface UserSummary {
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  isStaff: boolean;
}

interface UserState {
  hydrated: boolean;
  user: UserSummary | null;
  setUser: (user: UserSummary | null) => void;
}

export const useUserStore = create<UserState>()((set) => ({
  hydrated: false,
  user: null,
  setUser: (user) => set({ user, hydrated: true }),
}));

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? [...parts[0]].slice(0, 2) : [[...parts[0]][0], [...parts[parts.length - 1]][0]];
  return letters.join('').toUpperCase();
}
