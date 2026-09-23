"use client";

import { RACK_TONE, RackIllustration } from "@/components/rack";
import { cn } from "@/lib/cn";
import type { RackSummary } from "../types";
import { pct } from "./trayStyles";

/**
 * A rack in the aisle floor plan: the rack drawn as a steel shelving unit, over
 * its code and fill-percentage pill.
 *
 * The bin tint and the pill both come from `RACK_TONE`, keyed by the rack's
 * state, so the drawing and the number can never disagree.
 */
export function RackCard({
  rack,
  active,
  dimmed,
  onOpen,
}: {
  rack: RackSummary;
  active?: boolean;
  /** true when a legend/segment filter is active and this rack doesn't match it */
  dimmed?: boolean;
  onOpen: (rack: RackSummary) => void;
}) {
  const tone = RACK_TONE[rack.state];
  const { occupancy } = rack;
  const code = `${rack.aisle_code}-${rack.rack_code}`;
  const label = `${code} — ${tone.label}, ${pct(occupancy.occupancy_pct)} occupied (${occupancy.occupied}/${occupancy.capacity}), ${rack.shelf_count} shelves × ${rack.row_count} rows × ${rack.tray_count} trays`;

  return (
    <button
      type="button"
      onClick={() => onOpen(rack)}
      title={label}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      className={cn(
        "ds-focus-ring group flex h-[100px] w-full flex-col rounded-[10px] border px-2.5 pb-2 pt-1.5 text-left",
        "shadow-[0_1px_2px_rgb(16_33_43/0.04)] transition-[transform,box-shadow,border-color,background-color] duration-150",
        "hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-md)]",
        active
          ? "border-primary bg-[color-mix(in_srgb,var(--color-primary)_7%,var(--color-surface))]"
          : "border-[var(--rack-card-border)] bg-surface",
        dimmed && "opacity-30",
      )}
    >
      <span className="block min-h-0 flex-1" aria-hidden>
        <RackIllustration
          levels={rack.shelf_count}
          status={rack.state}
          fillPercent={occupancy.occupancy_pct}
        />
      </span>
      <span className="mt-1 flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-semibold text-text">{code}</span>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium tabular-nums"
          style={{ backgroundColor: tone.bg, color: tone.color }}
        >
          {pct(occupancy.occupancy_pct)}
        </span>
      </span>
    </button>
  );
}
