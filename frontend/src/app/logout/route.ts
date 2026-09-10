import { NextResponse, type NextRequest } from "next/server";

const API_BASE = process.env.API_INTERNAL_BASE_URL ?? "http://localhost:8000/api/v1";

async function endSession(req: NextRequest) {
  const refresh = req.cookies.get("refresh_token")?.value;
  if (refresh) {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { Cookie: `refresh_token=${refresh}` },
        cache: "no-store",
      });
    } catch {
      /* best effort — clear cookies regardless */
    }
  }
}

/** Programmatic logout (called by the Sign out button). */
export async function POST(req: NextRequest) {
  await endSession(req);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("access_token");
  res.cookies.delete("refresh_token");
  return res;
}

/** Convenience: visiting /logout in the browser signs out and shows the login screen. */
export async function GET(req: NextRequest) {
  await endSession(req);
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete("access_token");
  res.cookies.delete("refresh_token");
  return res;
}
