"use client";

import { useEffect, useState } from "react";
import { Check, MapPin, PackageMinus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/errors";
import { useOccupyTray, useReleaseTray } from "../hooks";
import type { SelectedLocation } from "../types";
import { TRAY_STATE } from "./trayStyles";

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
  onCleared,
}: {
  selected: SelectedLocation | null;
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
      <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface px-4 py-8 text-center">
        <MapPin className="mx-auto size-5 text-text-muted" />
        <p className="mt-2 text-xs font-medium">No tray selected</p>
        <p className="mt-1 text-xs text-text-secondary">
          Pick a tray in the rack, or run Locate Me for the nearest empty one.
        </p>
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

  const rows: [string, string][] = [
    ["Warehouse", selected.warehouse_code],
    ["Aisle", selected.aisle_code],
    ["Rack", selected.rack_code],
    ["Shelf", `S${selected.shelf_no}`],
    ["Row", `R${selected.row_no}`],
    ["Tray", String(selected.tray_no).padStart(2, "0")],
  ];

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <MapPin className="size-3.5 text-primary" />
          Selected Location
        </span>
        <StatusBadge
          label={TRAY_STATE[selected.state].label}
          tone={STATE_TONE[selected.state]}
        />
      </header>

      <dl className="divide-y divide-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-3.5 py-1.5">
            <dt className="text-xs text-text-muted">{label}</dt>
            <dd className="text-xs font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-border px-3.5 py-3">
        <p className="mb-2 text-center font-mono text-xs font-semibold tracking-wide text-primary">
          {selected.code}
        </p>

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
              className="h-8 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-xs text-text outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)]"
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
