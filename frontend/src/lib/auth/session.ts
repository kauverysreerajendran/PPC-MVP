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
 *
 * The shell only needs the user's identity (id, email, name, role). Those are
 * claims of the access JWT, which the backend signed and the middleware
 * obtained from `/auth/refresh` on this very session, so they are decoded here
 * (not re-verified: the token is HttpOnly and was issued by the backend; every
 * API call it is used for verifies the signature anyway). `/auth/me` is called
 * only when the token lacks those claims — tokens issued before the claims
 * were added — so existing sessions keep working.
 */

type AccessClaims = {
  sub?: unknown;
  role?: unknown;
  email?: unknown;
  name?: unknown;
};

function decodeJwtPayload(token: string): AccessClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload: unknown = JSON.parse(json);
    return payload && typeof payload === "object" ? (payload as AccessClaims) : null;
  } catch {
    return null;
  }
}

/** Build the shell user from token claims; null when the token predates them. */
function userFromAccessToken(token: string): User | null {
  const c = decodeJwtPayload(token);
  if (!c) return null;
  const id = typeof c.sub === "string" ? Number(c.sub) : NaN;
  if (!Number.isInteger(id) || typeof c.role !== "string" || typeof c.email !== "string") {
    return null;
  }
  if (!("name" in c) || (c.name !== null && typeof c.name !== "string")) return null;
  return {
    id,
    email: c.email,
    full_name: c.name,
    role: c.role as User["role"],
    // The backend refuses to issue a token to a disabled account
    // (auth service `authenticate` / `refresh`), so an existing token implies
    // an active user. Verification status and creation time are not carried
    // in the token and are not rendered by the shell.
    is_active: true,
    is_verified: false,
    created_at: "",
  };
}

export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get("access_token")?.value ?? null;
}

export async function getCurrentUser(): Promise<User | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const fromToken = userFromAccessToken(token);
  if (fromToken) return fromToken;
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
