"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rackLocatorApi } from "./api";
import type { LocateResult, RackDetail, ResolveResult, Topology } from "./types";

/**
 * Every query polls, so the visualisation tracks the database: a tray occupied
 * or freed elsewhere, a rack added to the master or a shelf count changed shows
 * up on the next tick with nothing cached client-side.
 */
const REFRESH_MS = 8_000;

export const rackLocatorKeys = {
  all: ["rack-locator"] as const,
  topology: (p: object) => ["rack-locator", "topology", p] as const,
  rack: (p: object) => ["rack-locator", "rack", p] as const,
  locate: (p: object) => ["rack-locator", "locate", p] as const,
};

export function useTopology(params: { warehouse_code?: string; aisle_code?: string } = {}) {
  return useQuery<Topology>({
    queryKey: rackLocatorKeys.topology(params),
    queryFn: ({ signal }) => rackLocatorApi.topology(params, { signal }),
    staleTime: 2_000,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });
}

export function useRackDetail(
  params: { warehouse_code: string; aisle_code: string; rack_code: string } | null,
) {
  return useQuery<RackDetail>({
    queryKey: rackLocatorKeys.rack(params ?? {}),
    queryFn: ({ signal }) => rackLocatorApi.rack(params!, { signal }),
    enabled: params !== null,
    staleTime: 2_000,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });
}

/**
 * "Locate Me" is deliberately manual: it runs when the user asks for it, and the
 * backend decides both which trays are free and how they rank.
 */
export function useLocate() {
  return useMutation<
    LocateResult,
    unknown,
    { warehouse_code?: string; aisle_code?: string; rack_code?: string; limit?: number }
  >({
    mutationFn: (params) => rackLocatorApi.locate(params),
  });
}

export function useResolveLocation() {
  return useMutation<
    ResolveResult,
    unknown,
    { q: string; warehouse_code?: string; aisle_code?: string }
  >({
    mutationFn: (params) => rackLocatorApi.resolve(params),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: rackLocatorKeys.all });
}

export function useOccupyTray() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: ({ id, model_no }: { id: string; model_no: string }) =>
      rackLocatorApi.occupy(id, { occupied_by_model: model_no }),
    onSuccess: done,
  });
}

export function useReleaseTray() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => rackLocatorApi.release(id),
    onSuccess: done,
  });
}
