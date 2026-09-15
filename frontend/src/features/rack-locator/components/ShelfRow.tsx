"use client";

import { cn } from "@/lib/cn";
import type { Recommendation, SelectedLocation, Shelf, Tray } from "../types";
import { TrayCell } from "./TrayCell";
import { rowPositionLabel } from "./trayStyles";

/**
 * One shelf: a label plate on the left, then the shelf's vertical rows stacked
 * front-to-back, each a single clean line of trays.
 *
 * A shelf with one row reads exactly like the physical rack. A shelf with
 * several rows stacks them tightly with a Front / Back tag, so the depth
 * dimension stays visible without clutter.
 */
export function ShelfRow({
  shelf,
  rowCount,
  selected,
  recommendations,
  onSelect,
  pickerMode,
}: {
  shelf: Shelf;
  rowCount: number;
  selected: SelectedLocation | null;
  recommendations: Recommendation[];
  onSelect: (tray: Tray, shelfNo: number, rowNo: number) => void;
  pickerMode?: boolean | undefined;
}) {
  const multiRow = shelf.rows.length > 1;
  const rankOf = (code: string) =>
    recommendations.find((r) => r.code === code)?.rank;
  const trayCount = shelf.rows[0]?.trays.length ?? 0;

  return (
    <div className="flex items-center gap-3">
      {/* shelf label plate */}
      <div className="w-14 shrink-0 pr-1 text-right">
        <div className="text-sm font-semibold leading-tight text-text">{shelf.label}</div>
        <div className="text-[10px] leading-tight text-text-muted tabular-nums">
          {shelf.occupancy.empty}/{shelf.occupancy.capacity} Empty
        </div>
      </div>

      {/* the shelf deck */}
      <div
        className={cn(
          "flex-1 rounded-[var(--radius-sm)] border border-border bg-surface-2/60 p-1.5",
          multiRow && "space-y-[3px]",
        )}
      >
        {shelf.rows.map((row) => {
          const posLabel = rowPositionLabel(row.row_no, rowCount);
          return (
            <div key={row.row_no} className="flex items-center gap-2">
              {multiRow ? (
                <span
                  className="flex w-9 shrink-0 items-baseline justify-end gap-1 text-[9px] font-medium uppercase leading-none tracking-wide text-text-muted"
                  title={`Row ${row.row_no}${posLabel ? ` (${posLabel})` : ""}`}
                >
                  {row.label}
                  {posLabel ? (
                    <span className="text-[7px] normal-case text-text-muted/70">
                      {posLabel.charAt(0)}
                    </span>
                  ) : null}
                </span>
              ) : null}
              <div
                className="grid flex-1 gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${trayCount}, minmax(0, 1fr))`,
                }}
              >
                {row.trays.map((tray) => (
                  <TrayCell
                    key={tray.code}
                    tray={tray}
                    selected={selected?.code === tray.code}
                    recommendedRank={rankOf(tray.code)}
                    onSelect={(t) => onSelect(t, shelf.shelf_no, row.row_no)}
                    pickerMode={pickerMode}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
