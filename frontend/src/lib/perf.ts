/**
 * Client-side request timing (docs/10 §7 — p95 must be observable).
 *
 * `lib/api/client.ts` records one sample per request: total wall time in the
 * browser and, when the server sent `Server-Timing: app;dur=<ms>`, the time the
 * server itself spent. The difference is network + proxy time. A small ring
 * buffer keeps the last samples so `LiveIndicator` and `lib/polling.ts` can
 * react, and so a developer can inspect them via `window.__ppcPerf` (dev only).
 *
 * Pure module state — no React, no storage, no network of its own.
 */

import type { ServiceInfo, ServiceKey } from "./api/services";

export type PerfSample = {
  path: string;
  method: string;
  status: number | null;
  /** ms from fetch start to body decoded */
  total_ms: number;
  /** ms reported by the server via Server-Timing, or null when absent */
  server_ms: number | null;
  at: number;
};

export type NetworkState = "fast" | "slow";

/** A request is network-dominated above this many ms outside the server. */
export const SLOW_NETWORK_MS = 400;
/** A request is server-dominated above this many ms inside the server. */
export const SLOW_SERVER_MS = 500;
/** Without Server-Timing, anything slower than this counts as slow. */
export const SLOW_TOTAL_MS = 1_200;

const MAX_SAMPLES = 50;
const samples: PerfSample[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function isSlowSample(s: PerfSample): boolean {
  if (s.server_ms != null) {
    return s.total_ms - s.server_ms > SLOW_NETWORK_MS || s.server_ms > SLOW_SERVER_MS;
  }
  return s.total_ms > SLOW_TOTAL_MS;
}

export function recordSample(s: PerfSample): void {
  samples.push(s);
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  if (process.env.NODE_ENV !== "production") {
    if (s.server_ms != null && s.total_ms - s.server_ms > SLOW_NETWORK_MS) {
      console.warn(
        `[ppc-perf] network-dominated: ${s.method} ${s.path} total=${Math.round(s.total_ms)}ms server=${Math.round(s.server_ms)}ms`,
      );
    } else if (s.server_ms != null && s.server_ms > SLOW_SERVER_MS) {
      console.warn(
        `[ppc-perf] server-dominated: ${s.method} ${s.path} server=${Math.round(s.server_ms)}ms`,
      );
    } else if (s.server_ms == null && s.total_ms > SLOW_TOTAL_MS) {
      console.warn(
        `[ppc-perf] slow (no Server-Timing): ${s.method} ${s.path} total=${Math.round(s.total_ms)}ms`,
      );
    }
  }
  notify();
}

export function getSamples(): readonly PerfSample[] {
  return samples;
}

// ---------------------------------------------------------------------------
// Service outages. `lib/api/client.ts` marks a service down the moment the
// Next proxy reports its upstream unreachable (a bare, non-JSON 5xx with no
// `Server-Timing`) and marks it up again on the next successful response.
// `ServiceOutageBanner` shows the list; polling keeps running so recovery is
// noticed automatically.

export interface ServiceOutage {
  service: ServiceInfo;
  since: number;
  /** last failing request path, for the tooltip */
  path: string;
}

const outages = new Map<ServiceKey, ServiceOutage>();
// Stable snapshot for useSyncExternalStore (must return the same reference
// until something changes).
let outageSnapshot: readonly ServiceOutage[] = [];

function refreshOutages(): void {
  outageSnapshot = [...outages.values()].sort((a, b) => a.since - b.since);
  notify();
}

export function markServiceDown(service: ServiceInfo, path: string): void {
  const existing = outages.get(service.key);
  if (existing) {
    existing.path = path;
    return;
  }
  outages.set(service.key, { service, since: Date.now(), path });
  refreshOutages();
}

export function markServiceUp(service: ServiceInfo): void {
  if (outages.delete(service.key)) refreshOutages();
}

export function getOutages(): readonly ServiceOutage[] {
  return outageSnapshot;
}

export function isServiceDown(key: ServiceKey): boolean {
  return outages.has(key);
}

/** "slow" when the last three requests were all slow (docs/10 §7 spirit). */
export function getNetworkState(): NetworkState {
  if (samples.length < 3) return "fast";
  const last = samples.slice(-3);
  return last.every(isSlowSample) ? "slow" : "fast";
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Parse `Server-Timing: app;dur=12.3, db;dur=4` → ms of the `app` entry. */
export function parseServerTiming(header: string | null): number | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const [name, ...params] = part.trim().split(";");
    if (name?.trim() !== "app") continue;
    for (const p of params) {
      const [k, v] = p.trim().split("=");
      if (k === "dur") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
    }
  }
  return null;
}

/** Slow connection hint from the browser, when the API exists. */
export function isSlowConnection(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  const c = nav.connection;
  if (!c) return false;
  return c.saveData === true || c.effectiveType === "2g" || c.effectiveType === "slow-2g";
}

// Dev-only inspection hook: window.__ppcPerf.samples() / .state()
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __ppcPerf?: unknown }).__ppcPerf = {
    samples: () => [...samples],
    state: getNetworkState,
    outages: getOutages,
  };
}
