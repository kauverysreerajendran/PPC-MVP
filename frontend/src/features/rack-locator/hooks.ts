"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rackLocatorApi } from "./api";
import type {
  FindResult,
  LocateResult,
  PlaceRequest,
  PlacedResult,
  RackDetail,
  ResolveResult,
  Topology,
} from "./types";
import { transactionalQueryOptions, usePollingInterval } from "@/lib/polling";

/**
 * Every query polls, so the visualisation tracks the database: a tray occupied
 * or freed elsewhere, a rack added to the master or a shelf count changed shows
 * up on the next tick with nothing cached client-side. The interval is the
 * shared, network-aware one from `lib/polling.ts`; the user's own actions
 * still refresh instantly through the invalidations below.
 */

export const rackLocatorKeys = {
  all: ["rack-locator"] as const,
  topology: (p: object) => ["rack-locator", "topology", p] as const,
  rack: (p: object) => ["rack-locator", "rack", p] as const,
  locate: (p: object) => ["rack-locator", "locate", p] as const,
};

export function useTopology(params: { warehouse_code?: string; aisle_code?: string } = {}) {
  const interval = usePollingInterval();
  return useQuery<Topology>({
    queryKey: rackLocatorKeys.topology(params),
    queryFn: ({ signal }) => rackLocatorApi.topology(params, { signal }),
    ...transactionalQueryOptions(interval),
    placeholderData: (prev) => prev,
  });
}

export function useRackDetail(
  params: { warehouse_code: string; aisle_code: string; rack_code: string } | null,
) {
  const interval = usePollingInterval();
  return useQuery<RackDetail>({
    queryKey: rackLocatorKeys.rack(params ?? {}),
    queryFn: ({ signal }) => rackLocatorApi.rack(params!, { signal }),
    enabled: params !== null,
    ...transactionalQueryOptions(interval),
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

/** Where is every tray of this model / lot? Runs on demand, then polls. */
export function useFindPlacements(
  params: { q: string; warehouse_code?: string; aisle_code?: string } | null,
) {
  const interval = usePollingInterval();
  return useQuery<FindResult>({
    queryKey: ["rack-locator", "find", params ?? {}],
    queryFn: ({ signal }) => rackLocatorApi.find(params!, { signal }),
    enabled: params !== null && params.q.trim().length > 0,
    ...transactionalQueryOptions(interval),
    placeholderData: (prev) => prev,
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

/** Received pieces of one SAP line already in trays (placement mode). */
export function usePlacedPieces(sapReferenceId: string | null) {
  const interval = usePollingInterval();
  return useQuery<PlacedResult>({
    queryKey: ["rack-locator", "placed", sapReferenceId],
    queryFn: ({ signal }) => rackLocatorApi.placed(sapReferenceId as string, { signal }),
    enabled: !!sapReferenceId,
    ...transactionalQueryOptions(interval),
  });
}

/** Store received pieces; refreshes the racks and the line's statuses. */
export function usePlaceReceived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PlaceRequest) => rackLocatorApi.place(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rackLocatorKeys.all });
      void qc.invalidateQueries({ queryKey: ["status"] });
    },
  });
}
