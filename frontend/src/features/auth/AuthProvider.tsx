"use client";

import { useRef, type ReactNode } from "react";
import { useAuthStore } from "@/stores/auth";
import type { User } from "@/lib/api/types";

/**
 * Seeds the client auth store from the server-rendered session before children
 * mount, so browser API calls carry a bearer token immediately — no 401 →
 * /auth/refresh round trip on every full page load.
 */
export function AuthProvider({
  token,
  user,
  children,
}: {
  token: string | null;
  user: User | null;
  children: ReactNode;
}) {
  const seeded = useRef(false);
  if (!seeded.current) {
    seeded.current = true;
    if (token) {
      useAuthStore.setState({ accessToken: token, user, status: "authenticated" });
    }
  }
  return <>{children}</>;
}
