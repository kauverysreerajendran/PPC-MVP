"use client";

import { cn } from "@/lib/cn";
import type { AisleSummary, RackSummary } from "../types";
import { RackCard } from "./RackCard";
import { num, pct } from "./trayStyles";

/**
 * The aisle drawn as a floor plan rather than a list: racks sit in their real
 * left-to-right order along a walkable lane, split onto the side of the aisle
 * each one actually faces.
 *
 * Racks whose master records no side all fall into the first bank, so an aisle
 * that was never sided still reads correctly.
 */
export function AisleMap({
  aisle,
  activeRackCode,
  onOpen,
}: {
  aisle: AisleSummary;
  activeRackCode?: string | undefined;
  onOpen: (rack: RackSummary) => void;
}) {
  const ordered = [...aisle.racks].sort((a, b) => a.position - b.position);
  const sides = [...new Set(ordered.map((r) => r.side ?? ""))];
  const near = ordered.filter((r) => (r.side ?? "") === sides[0]);
  const far = ordered.filter((r) => (r.side ?? "") !== sides[0]);

  return (
    <section
      className="rounded-[var(--radius-md)] border border-border bg-surface"
      aria-label={`Aisle ${aisle.aisle_code}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">
            Aisle {aisle.aisle_name ?? aisle.aisle_code}
          </h3>
          <p className="mt-0.5 text-xs text-text-secondary tabular-nums">
            {aisle.rack_count} racks · {num(aisle.occupancy.capacity)} trays ·{" "}
            {num(aisle.occupancy.empty)} empty
          </p>
        </div>
        <span className="text-xs font-medium tabular-nums text-text-secondary">
          {pct(aisle.occupancy.availability_pct)} available
        </span>
      </header>

      <div className="overflow-x-auto p-4">
        <div className="min-w-max space-y-2">
          <Bank racks={near} activeRackCode={activeRackCode} onOpen={onOpen} />
          <Lane label={`Aisle ${aisle.aisle_code}`} />
          {far.length > 0 ? (
            <Bank racks={far} activeRackCode={activeRackCode} onOpen={onOpen} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Bank({
  racks,
  activeRackCode,
  onOpen,
}: {
  racks: RackSummary[];
  activeRackCode?: string | undefined;
  onOpen: (rack: RackSummary) => void;
}) {
  if (racks.length === 0) return null;
  return (
    <div className="flex gap-2">
      {racks.map((rack) => (
        <div key={rack.id} className="w-[168px] shrink-0">
          <RackCard
            rack={rack}
            active={rack.rack_code === activeRackCode}
            onOpen={onOpen}
          />
        </div>
      ))}
    </div>
  );
}

/** The walkway between the two banks of racks. */
function Lane({ label }: { label: string }) {
  return (
    <div
      className={cn(
        "flex h-7 items-center justify-center rounded-[var(--radius-sm)]",
        "bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,var(--color-surface-2)_6px,var(--color-surface-2)_12px)]",
        "border-y border-dashed border-border",
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        {label}
      </span>
    </div>
  );
}
