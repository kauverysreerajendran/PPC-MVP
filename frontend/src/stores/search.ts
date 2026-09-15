"use client";

import { create } from "zustand";

/**
 * Text typed in the header ("elastic") search. Screens that support it read
 * `query` and filter server-side; screens that don't simply ignore it. The
 * shell clears it on every route change so a search never silently filters
 * another screen.
 */
interface SearchState {
  query: string;
  setQuery: (query: string) => void;
  clear: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
  clear: () => set({ query: "" }),
}));
