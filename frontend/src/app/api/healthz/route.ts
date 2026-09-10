import { NextResponse } from "next/server";

// Liveness probe for the Next.js container (used by Docker/K8s).
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
