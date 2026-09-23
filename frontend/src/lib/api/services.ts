/**
 * Which backend process owns which `/api/v1/*` prefix.
 *
 * Mirrors the rewrite table in `next.config.ts` (and `.env.local`). The browser
 * never talks to these ports directly — Next proxies — but knowing the owner
 * lets the client turn a bare proxy `500` ("upstream refused the connection")
 * into a precise, instant "the Masterdata service (:8002) is not running".
 */

export type ServiceKey = "backend" | "sap" | "masterdata" | "rack" | "status";

export interface ServiceInfo {
  key: ServiceKey;
  /** Human label shown in the outage banner. */
  name: string;
  /** Default local port (see `.env.local` / `next.config.ts`). */
  port: number;
  /** Path prefix under `/api/v1`. Empty string = the monolith (catch-all). */
  prefix: string;
}

export const SERVICES: readonly ServiceInfo[] = [
  { key: "sap", name: "SAP Integration", port: 8001, prefix: "/sap" },
  { key: "masterdata", name: "Masterdata", port: 8002, prefix: "/masterdata" },
  { key: "rack", name: "Rack", port: 8003, prefix: "/rack" },
  { key: "status", name: "Status", port: 8004, prefix: "/status" },
  { key: "backend", name: "Backend", port: 8000, prefix: "" },
];

/** Resolve the owning service for a client path such as `/sap/records`. */
export function serviceFor(path: string): ServiceInfo {
  // Absolute URLs (rare) — look at the pathname after `/api/v1`.
  let p = path;
  if (p.startsWith("http")) {
    try {
      p = new URL(p).pathname;
    } catch {
      /* fall through with the raw string */
    }
  }
  const i = p.indexOf("/api/v1");
  if (i >= 0) p = p.slice(i + "/api/v1".length);
  for (const s of SERVICES) {
    if (s.prefix && (p === s.prefix || p.startsWith(`${s.prefix}/`))) return s;
  }
  return SERVICES[SERVICES.length - 1]!;
}
