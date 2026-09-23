"use client";

import type { AisleSummary, RackSummary } from "../types";
import { RackCard } from "./RackCard";
import type { OccupancyTone } from "./trayStyles";

/**
 * One aisle as a floor plan: a titled grid of racks for each side of the aisle
 * ("AISLE A (LEFT)", "AISLE A (RIGHT)"), with the hatched walkway drawn between
 * them. Racks keep their real left-to-right order within a side.
 *
 * Racks whose master records no side all fall into one untitled-side group, so
 * an aisle that was never sided still reads correctly.
 */
export function AisleMap({
  aisle,
  activeRackCode,
  dimmedTone,
  onOpen,
}: {
  aisle: AisleSummary;
  activeRackCode?: string | undefined;
  /** legend/segment filter from the parent overview — racks not in this state are dimmed */
  dimmedTone?: OccupancyTone | null | undefined;
  onOpen: (rack: RackSummary) => void;
}) {
  const sides = groupBySide(aisle.racks);
  const aisleName = aisle.aisle_name ?? aisle.aisle_code;

  return (
    <section
      className="rounded-[var(--radius-lg)] border border-border bg-surface p-3 shadow-[var(--shadow-sm)]"
      aria-label={`Aisle ${aisleName}`}
    >
      {sides.map((group, i) => (
        <div key={group.side}>
          {i > 0 ? <AisleDivider label={`Aisle ${aisle.aisle_code}`} /> : null}
          <h3 className="mb-2 px-0.5 text-[15px] font-bold uppercase tracking-[0.5px] text-text">
            Aisle {aisle.aisle_code}
            {group.label ? ` (${group.label})` : ""}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.racks.map((rack) => (
              <RackCard
                key={rack.id}
                rack={rack}
                active={rack.rack_code === activeRackCode}
                dimmed={!!dimmedTone && rack.state !== dimmedTone}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      ))}
      {/* a single-sided aisle still shows its walkway */}
      {sides.length === 1 ? <AisleDivider label={`Aisle ${aisle.aisle_code}`} /> : null}
    </section>
  );
}

const SIDE_LABEL: Record<string, string> = { L: "Left", R: "Right" };

/** Racks grouped by the side of the aisle they face, left before right. */
function groupBySide(racks: RackSummary[]) {
  const ordered = [...racks].sort((a, b) => a.position - b.position);
  const keys = [...new Set(ordered.map((r) => (r.side ?? "").trim().toUpperCase()))].sort(
    (a, b) => sideRank(a) - sideRank(b) || a.localeCompare(b),
  );
  return keys.map((side) => ({
    side,
    label: SIDE_LABEL[side] ?? side,
    racks: ordered.filter((r) => (r.side ?? "").trim().toUpperCase() === side),
  }));
}

function sideRank(side: string) {
  if (side.startsWith("L")) return 0;
  if (side.startsWith("R")) return 1;
  return 2;
}

/** The walkway between the two banks of racks: a faint 45° hatch, label on the right. */
function AisleDivider({ label }: { label: string }) {
  return (
    <div
      className="my-3 flex h-[18px] items-center justify-end rounded-[3px] bg-[repeating-linear-gradient(45deg,var(--rack-hatch)_0_1.5px,transparent_1.5px_7px)]"
      aria-hidden
    >
      <span className="mr-4 bg-surface px-2 text-[10px] font-semibold uppercase leading-[18px] tracking-[3px] text-text-muted">
        {label}
      </span>
    </div>
  );
}
