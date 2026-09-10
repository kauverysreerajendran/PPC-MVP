"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { RackSummary } from "../types";
import { RACK_STATE, num, pct } from "./trayStyles";

const TONE_TEXT = {
  neutral: "text-text-secondary",
  success: "text-[var(--color-success)]",
  info: "text-[var(--color-info)]",
  warning: "text-[var(--color-warning)]",
  danger: "text-[var(--color-danger)]",
} as const;

/**
 * A rack as it appears on the aisle map: its identity, its shape, and a mini
 * elevation where each bar is one shelf filled to that shelf's occupancy — so
 * "which shelf still has room" is legible before drilling in.
 */
export function RackCard({
  rack,
  active,
  onOpen,
  compact = false,
}: {
  rack: RackSummary;
  active?: boolean;
  onOpen: (rack: RackSummary) => void;
  compact?: boolean;
}) {
  const state = RACK_STATE[rack.state];
  const { occupancy } = rack;

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onOpen(rack)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "ds-focus-ring group flex w-full items-center gap-2.5 border-l-2 px-3 py-2 text-left transition-colors",
          active
            ? "border-l-primary bg-teal-50 dark:bg-[#12333a]"
            : "border-l-transparent hover:bg-surface-2",
        )}
      >
        <MiniRack rack={rack} className="h-6 w-4" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold">
            {rack.aisle_code}-{rack.rack_code}
          </span>
          <span className="block text-[10px] tabular-nums text-text-muted">
            {rack.shelf_count}×{rack.row_count}×{rack.tray_count}
          </span>
        </span>
        <span className={cn("text-xs font-medium tabular-nums", TONE_TEXT[state.tone])}>
          {pct(occupancy.availability_pct)}
        </span>
        <ChevronRight className="size-3.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(rack)}
      aria-current={active ? "true" : undefined}
      className={cn(
        "ds-focus-ring group flex w-full flex-col gap-3 rounded-[var(--radius-md)] border bg-surface p-3 text-left transition-all duration-150",
        active
          ? "border-primary shadow-[var(--shadow-md)]"
          : "border-border hover:-translate-y-px hover:border-border-strong hover:shadow-[var(--shadow-md)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {rack.aisle_code}-{rack.rack_code}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-text-muted">
            {rack.shelf_count} shelves · {rack.row_count} rows · {rack.tray_count} trays
          </p>
        </div>
        <MiniRack rack={rack} className="h-11 w-7" />
      </div>

      <div>
        <div className="flex items-baseline justify-between text-xs">
          <span className={cn("font-medium", TONE_TEXT[state.tone])}>{state.label}</span>
          <span className="tabular-nums text-text-secondary">
            {num(occupancy.empty)}/{num(occupancy.capacity)} free
          </span>
        </div>
        <div
          className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2"
          role="img"
          aria-label={`${pct(occupancy.occupancy_pct)} occupied`}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.min(100, occupancy.occupancy_pct)}%` }}
          />
        </div>
      </div>
    </button>
  );
}

/**
 * A rack elevation in miniature: one bar per shelf, top shelf at the top,
 * each filled left-to-right by that shelf's occupancy.
 */
function MiniRack({ rack, className }: { rack: RackSummary; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 flex-col justify-between gap-px rounded-[3px] border border-border bg-surface-2 p-0.5",
        className,
      )}
      aria-hidden
    >
      {rack.shelves.map((shelf) => (
        <span
          key={shelf.shelf_no}
          className="relative block min-h-[2px] flex-1 overflow-hidden rounded-[1px] bg-teal-100 dark:bg-[#12333a]"
        >
          <span
            className="absolute inset-y-0 left-0 bg-[var(--color-text-muted)] opacity-50"
            style={{ width: `${Math.min(100, shelf.occupancy.occupancy_pct)}%` }}
          />
        </span>
      ))}
    </span>
  );
}
