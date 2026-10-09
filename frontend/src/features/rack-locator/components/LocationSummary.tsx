"use client";

import { useEffect, useState } from "react";
import { Box, Check, MapPin, PackageMinus, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/errors";
import { useOccupyTray, useReleaseTray } from "../hooks";
import { useBoxUid } from "../useBoxUid";
import { DEFAULT_TRAY_CAPACITY_QTY } from "../trayCapacity";
import type { SelectedLocation, SlotState } from "../types";
import { BAY_TRAY, OCCUPANCY_SCALE, TRAY_STATE, rowPositionLabel } from "./trayStyles";

/** One colour system: empty pulls the occupancy scale's blue, occupied is
 * neutral grey (it isn't part of the free->full scale), reserved and blocked
 * borrow the scale tones nearest their meaning. */
const SLOT_BADGE: Record<SlotState, { bg: string; text: string }> = {
  empty: { bg: OCCUPANCY_SCALE.empty.bg, text: OCCUPANCY_SCALE.empty.text },
  occupied: { bg: "bg-surface-2", text: "text-text-secondary" },
  reserved: { bg: OCCUPANCY_SCALE.filling.bg, text: OCCUPANCY_SCALE.filling.text },
  blocked: { bg: OCCUPANCY_SCALE.full.bg, text: OCCUPANCY_SCALE.full.text },
};

/**
 * What the user has pointed at, spelled out one level at a time, plus the one
 * action that follows from it: put a model in this tray, or take it out.
 */
export function LocationSummary({
  selected,
  rowCount,
  onCleared,
}: {
  selected: SelectedLocation | null;
  rowCount?: number | undefined;
  onCleared?: () => void;
}) {
  const [modelNo, setModelNo] = useState("");
  const toast = useToast();
  const occupy = useOccupyTray();
  const release = useReleaseTray();
  const { boxUid, isLoading: boxLoading } = useBoxUid(
    selected?.state === "occupied" ? selected.sap_reference_id : null,
  );

  // a new tray is a new decision — never carry the previous entry across
  useEffect(() => setModelNo(""), [selected?.code]);

  if (!selected) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-text">
          <MapPin className="size-4 text-primary" />
          Selected Location
        </h2>
        <div className="flex flex-col items-center rounded-[var(--radius-md)] border border-dashed border-border-strong bg-surface-2 px-3 py-5 text-center">
          <PackageOpen className="mb-1.5 size-6 text-text-muted" aria-hidden />
          <p className="text-sm font-medium">No tray selected</p>
          <p className="mt-1 text-xs text-text-secondary">
            Pick a tray in the rack, or run Locate Me.
          </p>
        </div>
      </div>
    );
  }

  async function confirm() {
    if (!selected?.id || !modelNo.trim()) return;
    try {
      await occupy.mutateAsync({ id: selected.id, model_no: modelNo.trim() });
      toast("success", `${modelNo.trim()} placed in ${selected.code}`);
      setModelNo("");
    } catch (err) {
      toast("error", err instanceof ApiError ? err.displayMessage : "Could not place the model");
    }
  }

  async function free() {
    if (!selected?.id) return;
    try {
      await release.mutateAsync(selected.id);
      toast("success", `${selected.code} released`);
      onCleared?.();
    } catch (err) {
      toast("error", err instanceof ApiError ? err.displayMessage : "Could not release the tray");
    }
  }

  const posLabel = rowCount ? rowPositionLabel(selected.row_no, rowCount) : "";
  const where: [string, string][] = [
    ["Rack", selected.rack_code],
    ["Shelf", `S${selected.shelf_no}`],
    ["Row", `R${selected.row_no}${posLabel ? ` (${posLabel})` : ""}`],
    ["Tray", `T${String(selected.tray_no).padStart(2, "0")}`],
  ];
  const occupied = selected.state === "occupied";
  const stateLabel = TRAY_STATE[selected.state].label.replace(" Tray", "");

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text">
          <MapPin className="size-4 text-primary" />
          Selected Location
        </h2>
        <span className="truncate rounded-full bg-[var(--color-primary-light)] px-2.5 py-0.5 font-mono text-xs font-semibold text-primary">
          {selected.code}
        </span>
      </div>

      {occupied ? (
        // the box is what the operator is holding and looking for — lead with it
        <div className="mb-3 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-primary)_30%,transparent)] bg-surface-2 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            <Box className="size-3 text-primary" />
            Box UID
          </div>
          <div
            className={cn(
              "mt-0.5 break-all font-mono text-base font-semibold leading-tight",
              boxUid ? "text-text" : "text-text-muted",
            )}
          >
            {boxUid ?? (boxLoading ? "Loading…" : "—")}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-x-4 text-xs">
        <dl className="space-y-2">
          {where.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <dt className="text-text-secondary">{label}</dt>
              <dd className="font-semibold tabular-nums text-text">{value}</dd>
            </div>
          ))}
        </dl>
        <dl className="space-y-2 border-l border-border pl-4">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-text-secondary">Status</dt>
            <dd
              className={cn(
                "inline-flex items-center gap-1.5 font-semibold",
                SLOT_BADGE[selected.state].text,
              )}
            >
              <span className={cn("size-2.5 rounded-full", BAY_TRAY[selected.state].className)} aria-hidden />
              {stateLabel}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-text-secondary">{occupied ? "Qty" : "Capacity"}</dt>
            <dd className="font-semibold tabular-nums text-text">
              {occupied
                ? selected.qty != null
                  ? Number(selected.qty).toLocaleString()
                  : "—"
                : DEFAULT_TRAY_CAPACITY_QTY}
            </dd>
          </div>
          {occupied ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-text-secondary">Model no.</dt>
                <dd className="truncate font-semibold text-text">{selected.occupied_by_model ?? "—"}</dd>
              </div>
              {selected.lot_no ? (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-text-secondary">Lot</dt>
                  <dd className="truncate font-semibold text-text">{selected.lot_no}</dd>
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-1">
              <dt className="text-text-secondary">Model no.</dt>
              <dd>
                <input
                  value={modelNo}
                  onChange={(e) => setModelNo(e.target.value)}
                  placeholder="Enter model no."
                  aria-label="Model number to store here"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void confirm();
                  }}
                  className="h-8 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-xs text-text outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)]"
                />
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="mt-3">
        {occupied ? (
          <Button
            variant="secondary"
            size="md"
            fullWidth
            loading={release.isPending}
            disabled={!selected.id}
            onClick={free}
          >
            <PackageMinus className="size-4" />
            Release Tray
          </Button>
        ) : (
          <Button
            size="md"
            fullWidth
            className="bg-[linear-gradient(135deg,var(--color-primary),color-mix(in_srgb,var(--color-primary)_65%,#062a2a))]"
            loading={occupy.isPending}
            disabled={
              !modelNo.trim() ||
              !selected.id ||
              !(selected.state === "empty" || selected.state === "reserved")
            }
            onClick={confirm}
          >
            <Check className="size-4" />
            Confirm Location
          </Button>
        )}
      </div>
    </div>
  );
}
