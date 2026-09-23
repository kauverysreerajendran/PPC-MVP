"use client";

import { useQuery } from "@tanstack/react-query";
import { masterdataApi } from "@/features/masterdata/api";
import type { SapOutward } from "@/features/masterdata/types";
import { usePlacedPieces } from "./hooks";

export interface PlacementTarget {
  /** true when the locator is running in placement mode (`?place=<id>`) */
  active: boolean;
  line: SapOutward | null;
  /** received pieces of this line already sitting in a tray */
  placedCount: number;
  /** received pieces still to place */
  remaining: number;
  /** accepted (received) qty of the line — what trays are filled by; null
   * when the line carries no quantity */
  receivedQty: number | null;
  /** qty of this line already sitting in trays */
  placedQty: number;
  /** qty still to place — the number the tray arithmetic runs on */
  remainingQty: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * The SAP outward line the Rack Locator is placing (`?place=<id>`).
 *
 * One source for the line, what of it is placed (pieces and qty) and what is left — the same
 * query key and the same `usePlacedPieces` call the placement screen used
 * before it was folded into the locator, so both read one cache entry.
 */
export function usePlacementTarget(placeId: string | null): PlacementTarget {
  const placeLine = useQuery<SapOutward>({
    queryKey: ["masterdata", "sap-outwards", "one", placeId],
    queryFn: ({ signal }) =>
      masterdataApi<SapOutward>("sap-outwards").get(placeId as string, { signal }),
    enabled: !!placeId,
    staleTime: 2_000,
  });

  const line = placeLine.data ?? null;
  const placed = usePlacedPieces(line?.sap_reference_id ?? null);
  const placedCount = placed.data?.placed ?? 0;
  const rawQty = line?.received_qty == null ? NaN : Number(line.received_qty);
  const receivedQty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : null;
  const placedQty = Number(placed.data?.placed_qty ?? 0) || 0;

  return {
    active: !!placeId,
    line,
    placedCount,
    remaining: line ? Math.max(0, line.received_pieces - placedCount) : 0,
    receivedQty,
    placedQty,
    remainingQty: receivedQty != null ? Math.max(0, receivedQty - placedQty) : 0,
    isLoading: !!placeId && (placeLine.isLoading || placed.isLoading),
    isError: placeLine.isError,
    refetch: () => {
      void placeLine.refetch();
      void placed.refetch();
    },
  };
}
