"use client";

import { useSyncExternalStore } from "react";
import { getNetworkState, isSlowConnection, subscribe } from "./perf";

/**
 * One place for every polling interval in the app (docs/09 §4, §8.1 — do not
 * refetch what has not changed; docs/05 §4.4 — one call per data need).
 *
 * - Transactional lists (SAP records / outwards / inward lines, rack slots,
 *   rack-locator topology, line statuses) poll at `POLL_TRANSACTIONAL_MS` and
 *   still refetch instantly after the user's own mutations (query invalidation
 *   is unchanged) and on window focus.
 * - Master / lookup lists (vendors, boxes, models, colours, locations, trays,
 *   status masters) do NOT poll: they are reference data with a long TTL and are
 *   invalidated by their own create / update / delete hooks.
 *
 * The interval adapts to the measured network: when the last three requests
 * were slow (see `lib/perf.ts`) it backs off to `POLL_SLOW_MS`; on a browser
 * that reports a 2g / save-data connection it starts at `POLL_SLOW_START_MS`.
 */
export const POLL_TRANSACTIONAL_MS = 30_000;
export const POLL_STALE_MS = 15_000;
export const POLL_SLOW_MS = 120_000;
export const POLL_SLOW_START_MS = 60_000;
/** Reference / master data: 5 minutes (docs/09 §4 says 1–24 h; 5 min is the floor). */
export const LOOKUP_STALE_MS = 5 * 60_000;

function pollingIntervalFor(base: number): number {
  if (getNetworkState() === "slow") return Math.max(base, POLL_SLOW_MS);
  if (isSlowConnection()) return Math.max(base, POLL_SLOW_START_MS);
  return base;
}

function getSnapshot(): number {
  return pollingIntervalFor(POLL_TRANSACTIONAL_MS);
}

function getServerSnapshot(): number {
  return POLL_TRANSACTIONAL_MS;
}

/**
 * Current polling interval (ms) for transactional queries. Re-renders the
 * caller only when the interval actually changes.
 */
export function usePollingInterval(base: number = POLL_TRANSACTIONAL_MS): number {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // `current` is computed for the default base; scale for a custom base while
  // keeping the same back-off rule.
  if (base === POLL_TRANSACTIONAL_MS) return current;
  return pollingIntervalFor(base);
}

/** Shared query options for a transactional (polled) list. */
export function transactionalQueryOptions(intervalMs: number) {
  return {
    staleTime: POLL_STALE_MS,
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  } as const;
}

/** Shared query options for a master / lookup list (no polling). */
export const lookupQueryOptions = {
  staleTime: LOOKUP_STALE_MS,
  refetchOnWindowFocus: true,
} as const;
