import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge auth guard + token mint.
 *
 * The refresh token is an HttpOnly cookie. On navigation to a *protected* route
 * we mint a short-lived access-token cookie from it once, here, where we can
 * also persist the rotated refresh cookie back to the browser — so RSC code
 * never calls /auth/refresh on every render.
 *
 * Public routes (login, marketing, assets) never trigger a network call: the
 * middleware returns immediately.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/scan",
  "/production",
  "/sap-outward",
  "/polishing-return",
  "/inspection",
  "/traceability",
  "/alerts",
  "/reports",
  "/settings",
];

const API_BASE =
  process.env.API_INTERNAL_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const accessToken = req.cookies.get("access_token")?.value;
  // Fresh access token already present — nothing to do (the common case).
  if (accessToken) return NextResponse.next();

  // Public route: never do a blocking refresh here.
  if (!isProtected(pathname)) return NextResponse.next();

  const refreshToken = req.cookies.get("refresh_token")?.value;
  if (!refreshToken) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Mint an access token from the refresh cookie; persist rotation.
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `refresh_token=${refreshToken}` },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`refresh ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };

    const out = NextResponse.next();
    out.cookies.set("access_token", body.access_token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(30, (body.expires_in ?? 900) - 30),
    });
    const rotated = res.headers.get("set-cookie");
    if (rotated) out.headers.append("set-cookie", rotated);
    return out;
  } catch {
    const out = NextResponse.redirect(new URL("/login", req.url));
    out.cookies.delete("access_token");
    out.cookies.delete("refresh_token");
    return out;
  }
}

export const config = {
  // Only run on real navigations. Everything under _next, api, logout and any
  // request with a file extension (assets) is skipped.
  matcher: ["/((?!_next/|api/|logout|.*\\.[\\w]+$).*)"],
};
