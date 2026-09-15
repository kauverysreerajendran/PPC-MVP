"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useToast } from "@/components/ui/Toast";
import { WaveBanner } from "@/components/ui/WaveBanner";
import { ApiError } from "@/lib/api/errors";
import { masterdataApi } from "@/features/masterdata/api";
import type { SapOutward } from "@/features/masterdata/types";
import { useLocate, usePlaceReceived, usePlacedPieces, useTopology } from "../../hooks";
import type { ChosenTray, PlaceResult, Recommendation } from "../../types";
import { BlockedMessage } from "./BlockedMessage";
import { ConfirmBar } from "./ConfirmBar";
import { LineSummaryCard } from "./LineSummaryCard";
import { PlacedSummary } from "./PlacedSummary";
import { TraySuggestions } from "./TraySuggestions";
import { pieceQty } from "./pieceQty";

function toChosen(r: Recommendation): ChosenTray {
  return {
    id: r.id,
    code: r.code,
    warehouse_code: r.warehouse_code,
    aisle_code: r.aisle_code,
    rack_code: r.rack_code,
    shelf_no: r.shelf_no,
    row_no: r.row_no,
    tray_no: r.tray_no,
  };
}

/**
 * The dedicated three-step placement screen opened from SAP Inward's
 * "Place in rack" button (`/rack-locator?place=<sap outward line id>`).
 * Nothing from the general locator renders here — no warehouse/aisle/rack
 * selects, no Locate Me, no location summary, no model placements.
 */
export function PlacementFlow({ placeId }: { placeId: string }) {
  const router = useRouter();
  const toast = useToast();

  const placeLine = useQuery<SapOutward>({
    queryKey: ["masterdata", "sap-outwards", "one", placeId],
    queryFn: ({ signal }) =>
      masterdataApi<SapOutward>("sap-outwards").get(placeId, { signal }),
    staleTime: 2_000,
  });

  const topology = useTopology();
  const locate = useLocate();
  const placeReceived = usePlaceReceived();
  const placed = usePlacedPieces(placeLine.data?.sap_reference_id ?? null);

  const [chosen, setChosen] = useState<ChosenTray[]>([]);
  const [noFreeTray, setNoFreeTray] = useState(false);
  const [placeResult, setPlaceResult] = useState<PlaceResult | null>(null);
  const didSuggest = useRef(false);

  const placedCount = placed.data?.placed ?? 0;
  const line = placeLine.data;
  const remaining = line ? Math.max(0, line.received_pieces - placedCount) : 0;
  const defaultWarehouse = topology.data?.warehouses[0];

  async function suggestTrays() {
    if (!defaultWarehouse || remaining <= 0) return;
    try {
      // A locate call with no aisle_code already ranks every empty tray across
      // the whole warehouse (services/rack/app/topology.py:441-480 — the
      // aisle filter is only applied when aisle_code is given), so one call
      // covers the "search per aisle" fallback too; a second, narrower pass
      // would only find a subset of what this call already returns.
      const result = await locate.mutateAsync({
        warehouse_code: defaultWarehouse.warehouse_code,
        limit: Math.min(remaining, 50),
      });
      const picks = result.recommendations.slice(0, remaining).map(toChosen);
      setChosen(picks);
      setNoFreeTray(result.recommendations.length === 0);
    } catch (err) {
      toast("error", err instanceof ApiError ? err.displayMessage : "Could not suggest trays");
    }
  }

  // suggest once, as soon as the line, its placed count and the topology default are in
  useEffect(() => {
    if (didSuggest.current || !line || !placed.data || !defaultWarehouse) return;
    didSuggest.current = true;
    if (remaining > 0) void suggestTrays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, placed.data, defaultWarehouse]);

  function changePiece(index: number, tray: ChosenTray) {
    setChosen((prev) => prev.map((c, i) => (i === index ? tray : c)));
  }

  function skipPiece(index: number) {
    setChosen((prev) => prev.filter((_, i) => i !== index));
  }

  function freeCountOf(rackCode: string): number | null {
    for (const a of defaultWarehouse?.aisles ?? []) {
      const rack = a.racks.find((r) => r.rack_code === rackCode);
      if (rack) return rack.occupancy.empty;
    }
    return null;
  }

  async function confirmPlacement() {
    if (!line?.model_no || chosen.length === 0) return;
    try {
      const res = await placeReceived.mutateAsync({
        sap_reference_id: line.sap_reference_id,
        model_no: line.model_no,
        lot_no: line.lot_no,
        received_pieces: line.received_pieces,
        pieces: chosen.map((c, i) => ({
          slot_id: c.id,
          qty: pieceQty(line, placedCount + i + 1),
        })),
      });
      toast("success", "Placed in rack");
      setPlaceResult(res);
      setChosen([]);
    } catch (err) {
      toast("error", err instanceof ApiError ? err.displayMessage : "Could not place the pieces");
    }
  }

  const banner = (
    <WaveBanner
      breadcrumb={[{ label: "SAP Inward" }, { label: "Place in rack" }]}
      title="Place received pieces"
      subtitle={line?.box_uid ? `Box ${line.box_uid}` : undefined}
      actions={
        <Button variant="secondary" size="sm" onClick={() => router.push("/sap-inward")}>
          <ArrowLeft className="size-3.5" />
          Back to SAP Inward
        </Button>
      }
    />
  );

  if (placeLine.isLoading || topology.isLoading) {
    return (
      <div>
        {banner}
        <PageSkeleton table={false} />
      </div>
    );
  }

  if (placeLine.isError || topology.isError) {
    return (
      <div>
        {banner}
        <ErrorState
          title="Unable to load this line"
          onRetry={() => {
            void placeLine.refetch();
            void topology.refetch();
          }}
        />
      </div>
    );
  }

  if (!line) {
    return (
      <div>
        {banner}
        <ErrorState title="This SAP line could not be found" />
      </div>
    );
  }

  if (line.received_pieces === 0) {
    return (
      <div>
        {banner}
        <BlockedMessage
          title="Nothing received on this line yet"
          description="Enter the accepted quantity on SAP Inward, then come back."
          cta={{ label: "Go to SAP Inward", href: "/sap-inward" }}
        />
      </div>
    );
  }

  if (!line.model_no) {
    return (
      <div>
        {banner}
        <BlockedMessage
          title="This line has no model number"
          description="Fix it in Master Data before placing."
          cta={{ label: "Go to Master Data", href: "/master-data" }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-4">
      {banner}

      {placeResult ? (
        <PlacedSummary slots={placeResult.slots} />
      ) : (
        <>
          <LineSummaryCard line={line} placedCount={placedCount} remaining={remaining} />

          {remaining === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-success)_30%,var(--color-border))] bg-[var(--color-success-bg)] p-4 text-sm font-medium text-[var(--color-success)]">
              All {line.received_pieces} received pieces are already in racks.
            </div>
          ) : (
            <>
              <TraySuggestions
                remaining={remaining}
                chosen={chosen}
                qtyForPiece={(i) => (line ? pieceQty(line, placedCount + i + 1) : null)}
                freeCountOf={freeCountOf}
                suggesting={locate.isPending || placed.isLoading}
                onSuggestAgain={() => void suggestTrays()}
                onChangePiece={changePiece}
                onSkipPiece={skipPiece}
                noFreeTray={noFreeTray}
                warehouseName={defaultWarehouse?.warehouse_name ?? defaultWarehouse?.warehouse_code ?? ""}
                occupancyLine={
                  defaultWarehouse
                    ? `${defaultWarehouse.occupancy.occupied} occupied · ${defaultWarehouse.occupancy.empty} empty · ${defaultWarehouse.occupancy.capacity} trays`
                    : ""
                }
              />
              <ConfirmBar
                count={chosen.length}
                disabled={chosen.length === 0}
                pending={placeReceived.isPending}
                onConfirm={() => void confirmPlacement()}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
