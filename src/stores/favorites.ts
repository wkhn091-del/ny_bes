'use client';

import { create } from 'zustand';

/** Space ids only, hydrated from the server for the signed-in user. Not persisted. */
interface FavoritesState {
  loggedIn: boolean;
  ids: ReadonlySet<string>;
  hydrate: (loggedIn: boolean, ids: string[]) => void;
  set: (spaceId: string, favorite: boolean) => void;
}

export const useFavorites = create<FavoritesState>()((set) => ({
  loggedIn: false,
  ids: new Set(),
  hydrate: (loggedIn, ids) => set({ loggedIn, ids: new Set(ids) }),
  set: (spaceId, favorite) =>
    set((state) => {
      const next = new Set(state.ids);
      if (favorite) next.add(spaceId);
      else next.delete(spaceId);
      return { ids: next };
    }),
}));

/** Space the visitor tried to save before signing in; picked up once after login. */
export const PENDING_FAVORITE_KEY = 'spacehub-pending-favorite';
