"use client";

import { cn } from "@/lib/cn";
import type { Recommendation, SelectedLocation, Shelf, Tray } from "../types";
import { TrayCell } from "./TrayCell";

/**
 * One shelf of the rack: a label block, then its vertical rows stacked
 * front-to-back, each holding that row's trays.
 *
 * Row labels only appear when the shelf actually has more than one row — a
 * single-row rack should not pay for a column it does not need.
 */
export function ShelfRow({
  shelf,
  selected,
  recommendations,
  onSelect,
}: {
  shelf: Shelf;
  selected: SelectedLocation | null;
  recommendations: Recommendation[];
  onSelect: (tray: Tray, shelfNo: number, rowNo: number) => void;
}) {
  const multiRow = shelf.rows.length > 1;
  const rankOf = (code: string) =>
    recommendations.find((r) => r.code === code)?.rank;

  return (
    <div className="flex items-stretch gap-1.5">
      {/* shelf label — mirrors the "S6 / 4 of 15 empty" plate on the real rack */}
      <div className="mr-1 flex w-12 shrink-0 flex-col justify-center rounded-[var(--radius-sm)] border border-border bg-surface px-1 py-1 text-center">
        <span className="text-xs font-semibold leading-none">{shelf.label}</span>
        <span className="mt-1 text-[10px] leading-tight text-text-muted tabular-nums">
          {shelf.occupancy.empty}/{shelf.occupancy.capacity}
        </span>
        <span className="text-[9px] uppercase leading-tight tracking-wide text-text-muted">
          empty
        </span>
      </div>

      <Upright />

      {/* the shelf deck */}
      <div className="shrink-0 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--color-teal-800)_18%,var(--color-border))] bg-gradient-to-b from-surface-2 to-surface p-1.5">
        <div className="flex flex-col gap-[3px]">
          {shelf.rows.map((row) => (
            <div key={row.row_no} className="flex items-center gap-1.5">
              {multiRow ? (
                <span
                  className="w-4 shrink-0 text-right text-[8px] font-medium uppercase tabular-nums text-text-muted"
                  title={`Row ${row.row_no}${row.row_no === 1 ? " (front)" : ""}`}
                >
                  {row.label}
                </span>
              ) : null}
              <div className="flex gap-[3px]">
                {row.trays.map((tray) => (
                  <TrayCell
                    key={tray.code}
                    tray={tray}
                    selected={selected?.code === tray.code}
                    recommendedRank={rankOf(tray.code)}
                    onSelect={(t) => onSelect(t, shelf.shelf_no, row.row_no)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Upright />
    </div>
  );
}

/** A steel upright of the rack frame. Structure, not data — greyscale only. */
function Upright() {
  return (
    <div
      className={cn(
        "w-[7px] shrink-0 rounded-[2px] bg-gradient-to-r",
        "from-[color-mix(in_srgb,var(--color-teal-900)_55%,transparent)]",
        "via-[color-mix(in_srgb,var(--color-teal-800)_35%,transparent)]",
        "to-[color-mix(in_srgb,var(--color-teal-900)_55%,transparent)]",
      )}
      aria-hidden
    />
  );
}
