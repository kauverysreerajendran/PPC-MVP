"use client";

import { create } from "zustand";
import { api, configureTokenProvider } from "@/lib/api/client";
import type { TokenResponse, User } from "@/lib/api/types";

/**
 * Client-side auth state. The access token is kept in memory only (never
 * localStorage). The refresh token is an HttpOnly cookie the browser attaches
 * automatically to /auth/* requests.
 */
interface AuthState {
  user: User | null;
  accessToken: string | null;
  status: "idle" | "authenticating" | "authenticated" | "anonymous";
  setSession: (token: string, user: User | null) => void;
  clear: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  status: "idle",

  setSession: (accessToken, user) =>
    set({ accessToken, user, status: user ? "authenticated" : "authenticated" }),

  clear: () => set({ accessToken: null, user: null, status: "anonymous" }),

  login: async (email, password) => {
    set({ status: "authenticating" });
    try {
      const res = await api.post<TokenResponse>("/auth/login", { email, password });
      const user = await api.get<User>("/auth/me", { accessToken: res.access_token });
      set({ accessToken: res.access_token, user, status: "authenticated" });
    } catch (err) {
      set({ status: "anonymous" });
      throw err;
    }
  },

  logout: async () => {
    try {
      // Hits the Next route handler so the middleware-minted access_token
      // cookie is cleared too, not just the backend refresh token.
      await fetch("/logout", { method: "POST", cache: "no-store" });
    } finally {
      get().clear();
    }
  },

  hydrate: async () => {
    try {
      const res = await api.post<TokenResponse>("/auth/refresh");
      const user = await api.get<User>("/auth/me", { accessToken: res.access_token });
      set({ accessToken: res.access_token, user, status: "authenticated" });
    } catch {
      set({ status: "anonymous" });
    }
  },
}));

// Bridge the store to the API client so it can inject / refresh tokens.
configureTokenProvider({
  get: () => useAuthStore.getState().accessToken,
  set: (token) => useAuthStore.setState({ accessToken: token }),
  refresh: async () => {
    try {
      const res = await api.post<TokenResponse>("/auth/refresh");
      useAuthStore.setState({ accessToken: res.access_token });
      return res.access_token;
    } catch {
      useAuthStore.getState().clear();
      return null;
    }
  },
});
