'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Track } from '@/lib/types';

interface LibraryState {
  favorites: Track[];
  recents: Track[];
  toggleFavorite: (track: Track) => void;
  removeFavorite: (videoId: string) => void;
  addRecent: (track: Track) => void;
  clearRecents: () => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      favorites: [],
      recents: [],

      toggleFavorite: (track) => {
        const exists = get().favorites.some((item) => item.videoId === track.videoId);
        set({
          favorites: exists
            ? get().favorites.filter((item) => item.videoId !== track.videoId)
            : [track, ...get().favorites]
        });
      },

      removeFavorite: (videoId) => {
        set({ favorites: get().favorites.filter((item) => item.videoId !== videoId) });
      },

      addRecent: (track) => {
        const rest = get().recents.filter((item) => item.videoId !== track.videoId);
        set({ recents: [track, ...rest].slice(0, 60) });
      },

      clearRecents: () => set({ recents: [] })
    }),
    {
      name: 'dvibes-library-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ favorites: state.favorites, recents: state.recents })
    }
  )
);
