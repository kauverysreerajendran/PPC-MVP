import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { User } from "@/lib/api/types";

/**
 * Server-side auth helpers. `middleware.ts` mints a short-lived `access_token`
 * cookie from the HttpOnly refresh cookie (and persists rotation). RSC code just
 * reads that access token — no per-render network round trip.
 */

export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get("access_token")?.value ?? null;
}

export async function getCurrentUser(): Promise<User | null> {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    return await api.get<User>("/auth/me", { accessToken: token });
  } catch (err) {
    if (err instanceof ApiError && err.isAuthError) return null;
    throw err;
  }
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
