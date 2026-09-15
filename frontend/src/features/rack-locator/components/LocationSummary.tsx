"use client";

import { useEffect, useState } from "react";
import { Check, MapPin, PackageMinus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/errors";
import { useOccupyTray, useReleaseTray } from "../hooks";
import type { SelectedLocation } from "../types";
import { TRAY_STATE, rowPositionLabel } from "./trayStyles";

const STATE_TONE = {
  empty: "success",
  occupied: "neutral",
  reserved: "warning",
  blocked: "danger",
} as const;

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

  // a new tray is a new decision — never carry the previous entry across
  useEffect(() => setModelNo(""), [selected?.code]);

  if (!selected) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text">
          <MapPin className="size-3.5 text-primary" />
          Selected Location
        </h2>
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface-2 px-3 py-6 text-center">
          <p className="text-xs font-medium">No tray selected</p>
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
  const rows: [string, string][] = [
    ["Rack", selected.rack_code],
    ["Shelf", `S${selected.shelf_no}`],
    ["Row", `R${selected.row_no}${posLabel ? ` (${posLabel})` : ""}`],
    ["Tray", String(selected.tray_no).padStart(2, "0")],
  ];
  if (selected.occupied_by_model) rows.push(["Model", selected.occupied_by_model]);
  if (selected.lot_no) rows.push(["Lot", selected.lot_no]);
  if (selected.qty != null) rows.push(["Qty", Number(selected.qty).toLocaleString()]);

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text">
          <MapPin className="size-3.5 text-primary" />
          Selected Location
        </h2>
        <StatusBadge
          label={TRAY_STATE[selected.state].label.replace(" Tray", "")}
          tone={STATE_TONE[selected.state]}
        />
      </div>

      <dl className="space-y-1.5 rounded-[var(--radius-md)] bg-teal-50 p-3 text-sm dark:bg-[#12333a]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between">
            <dt className="text-text-secondary">{label}</dt>
            <dd className="font-medium tabular-nums text-text">{value}</dd>
          </div>
        ))}
        <div className="mt-1 border-t border-[color-mix(in_srgb,var(--color-primary)_20%,transparent)] pt-1.5 text-center font-mono text-xs font-semibold tracking-wide text-primary">
          {selected.code}
        </div>
      </dl>

      <div className="mt-3">
        {selected.state === "occupied" ? (
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            loading={release.isPending}
            disabled={!selected.id}
            onClick={free}
          >
            <PackageMinus className="size-3.5" />
            Release Tray
          </Button>
        ) : (
          <div className="space-y-2">
            <input
              value={modelNo}
              onChange={(e) => setModelNo(e.target.value)}
              placeholder="Model no."
              aria-label="Model number to store here"
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirm();
              }}
              className="h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-sm text-text outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)]"
            />
            <Button
              size="sm"
              fullWidth
              loading={occupy.isPending}
              disabled={!modelNo.trim() || !selected.id}
              onClick={confirm}
            >
              <Check className="size-3.5" />
              Confirm Location
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
