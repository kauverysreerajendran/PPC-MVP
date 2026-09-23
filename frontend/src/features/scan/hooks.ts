"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { transactionalQueryOptions, usePollingInterval } from "@/lib/polling";
import type { Page, SapOutward } from "@/features/masterdata/types";
import { rackLocatorApi } from "@/features/rack-locator/api";
import { statusApi } from "@/features/status/api";
import type { LineStatus, StatusStage } from "@/features/status/types";
import type { ScanKind } from "./detect";
import { resolveScan } from "./resolve";

/** Every query of the Scan page, so a scan can be refreshed as one. */
export const scanKeys = {
  all: ["scan"] as const,
  resolve: (kind: ScanKind, value: string) => ["scan", "resolve", kind, value] as const,
};

/** What a scanned value names — polled, so the result stays live. */
export function useScanResolution(active: { value: string; kind: ScanKind } | null) {
  const interval = usePollingInterval();
  return useQuery({
    queryKey: scanKeys.resolve(active?.kind ?? "search", active?.value ?? ""),
    queryFn: () => resolveScan(active!.value, active!.kind),
    enabled: !!active,
    retry: false,
    ...transactionalQueryOptions(interval),
  });
}

export type StageStatuses = Partial<Record<StatusStage, LineStatus>>;

/** Current status per stage of each reference, from the Status service. */
export function useStageStatuses(refs: string[]) {
  const interval = usePollingInterval();
  const key = useMemo(() => [...new Set(refs)].sort().join(","), [refs]);
  const q = useQuery({
    queryKey: ["status", "lines", key],
    queryFn: ({ signal }) => statusApi.lines({ refs: key, page_size: 500 }, { signal }),
    enabled: key.length > 0,
    retry: false,
    ...transactionalQueryOptions(interval),
  });
  const byRef = useMemo(() => {
    const m = new Map<string, StageStatuses>();
    for (const l of q.data?.items ?? []) {
      const e = m.get(l.sap_reference_id) ?? {};
      e[l.stage] = l;
      m.set(l.sap_reference_id, e);
    }
    return m;
  }, [q.data]);
  return { byRef, isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
}

/** Trays holding received pieces of one line (the rack service). */
export function usePlacedTrays(ref: string | null) {
  const interval = usePollingInterval();
  return useQuery({
    queryKey: ["scan", "placed", ref],
    queryFn: ({ signal }) => rackLocatorApi.placed(ref!, { signal }),
    enabled: !!ref,
    retry: false,
    ...transactionalQueryOptions(interval),
  });
}

/** The racks behind a set of trays — for the orientation drawing. */
export function useRacksOf(
  slots: { warehouse_code?: string | undefined; aisle_code?: string | undefined; rack_code: string }[],
) {
  const racks = useMemo(() => {
    const seen = new Map<string, { warehouse_code: string; aisle_code: string; rack_code: string }>();
    for (const s of slots) {
      if (!s.warehouse_code || !s.aisle_code) continue;
      const k = `${s.warehouse_code}/${s.aisle_code}/${s.rack_code}`;
      if (!seen.has(k)) {
        seen.set(k, { warehouse_code: s.warehouse_code, aisle_code: s.aisle_code, rack_code: s.rack_code });
      }
    }
    return [...seen.values()].slice(0, 3);
  }, [slots]);
  return useQueries({
    queries: racks.map((r) => ({
      queryKey: ["scan", "rack", r.warehouse_code, r.aisle_code, r.rack_code],
      queryFn: ({ signal }: { signal: AbortSignal }) => rackLocatorApi.rack(r, { signal }),
      staleTime: 60_000,
      retry: false,
    })),
  });
}

/** The line a shortage back-order was raised from — for the trail fallback. */
export function useParentLine(ref: string | null) {
  return useQuery({
    queryKey: ["scan", "parent", ref],
    queryFn: ({ signal }) =>
      api
        .get<Page<SapOutward>>("/masterdata/sap-outwards", {
          signal,
          query: { refs: ref!, status: "active", page_size: 1, with_total: false },
        })
        .then((p) => p.items[0] ?? null),
    enabled: !!ref,
    staleTime: 60_000,
    retry: false,
  });
}
