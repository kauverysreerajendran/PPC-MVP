"use client";

import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/cn";
import type { RackSummary } from "../types";
import { RACK_STATE, TONE_BG, TONE_FILL, TONE_TEXT, num, pct, toneForOccupancyPct } from "./trayStyles";

/**
 * A rack in a list. `compact` is the row in the "Racks in Aisle" rail — icon,
 * id, and how empty it is. The full card adds the shape and a fill bar for the
 * aisle overview.
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
          "ds-focus-ring group flex w-full items-center justify-between gap-1.5 rounded-[var(--radius-xs)] px-2 py-1 text-left text-xs transition-colors",
          active
            ? "bg-teal-50 font-medium text-teal-800 dark:bg-[#12333a] dark:text-teal-200"
            : "text-text-secondary hover:bg-surface-2",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <LayoutGrid className="size-3 shrink-0 text-text-muted" />
          <span className="truncate">
            {rack.aisle_code}-{rack.rack_code}
          </span>
        </span>
        <span className={cn("shrink-0 text-[11px] tabular-nums", TONE_TEXT[state.tone])}>
          {pct(occupancy.availability_pct)}
        </span>
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
          className={cn("mt-1.5 h-1 overflow-hidden rounded-full", TONE_BG[state.tone])}
          role="img"
          aria-label={`${pct(occupancy.occupancy_pct)} occupied`}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-300", TONE_FILL[state.tone])}
            style={{ width: `${Math.min(100, occupancy.occupancy_pct)}%` }}
          />
        </div>
      </div>
    </button>
  );
}

/**
 * A rack elevation in miniature: one bar per shelf, top shelf at the top, each
 * filled left-to-right by that shelf's occupancy.
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
      {rack.shelves.map((shelf) => {
        const tone = toneForOccupancyPct(shelf.occupancy.occupancy_pct);
        return (
          <span
            key={shelf.shelf_no}
            className={cn("relative block min-h-[2px] flex-1 overflow-hidden rounded-[1px]", TONE_BG[tone])}
          >
            <span
              className={cn("absolute inset-y-0 left-0", TONE_FILL[tone])}
              style={{ width: `${Math.min(100, shelf.occupancy.occupancy_pct)}%` }}
            />
          </span>
        );
      })}
    </span>
  );
}
