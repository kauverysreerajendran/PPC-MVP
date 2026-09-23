"use client";

import { cn } from "@/lib/cn";

/**
 * One rack drawn as a shelf x column matrix: a rail of shelves down the left
 * (in the order the caller sends them), a header of columns across the top, and one soft card
 * per intersection holding that column's trays as thin horizontal bars stacked
 * bottom-up — the bar at the bottom is tray 1, so a column that fills in order
 * reads as a bar chart growing upwards.
 *
 * Plain grid + buttons rather than SVG: the bars are real focusable elements,
 * so tooltips, keyboard activation and horizontal scrolling all come for free.
 *
 * Like `RackIllustration` this component knows nothing about the rack feature:
 * geometry, colour and labels are all passed in, so a 4x12 rack and a 6x4x15
 * rack come out right and the one place tray colour is decided stays
 * `features/rack-locator/components/trayStyles.ts`.
 */

export type MatrixTrayState = "empty" | "occupied" | "reserved" | "blocked";

export interface MatrixTray {
  /** stable identity — the tray's location code does nicely */
  key: string;
  number: number;
  state: MatrixTrayState;
  /** the bar's paint, from the caller's colour table */
  className: string;
  selected?: boolean;
  /** Locate Me rank (1, 2, 3 ...) — draws the marker on the bar */
  rank?: number | undefined;
  /** a live suggestion waiting to be taken — pulses (static ring under
   * `prefers-reduced-motion`); the rank badge says the same thing silently */
  suggested?: boolean | undefined;
  /** not choosable right now; drawn normally but inert and not focusable */
  disabled?: boolean;
  /** hover text, e.g. "A-S4-R2-T05 · Empty" */
  tooltip: string;
  /** the sentence a screen reader hears — shelf, column, tray and state */
  ariaLabel: string;
}

export interface MatrixColumn {
  key: string;
  /** ascending tray number; drawn bottom-up so tray 1 sits on the floor */
  trays: MatrixTray[];
  /** an optional one-click action on the whole column, e.g. "All empty" */
  action?:
    | {
        label: string;
        title: string;
        onClick: () => void;
        disabled?: boolean;
        /** drawn as pressed — the action's effect is already in place */
        active?: boolean;
      }
    | undefined;
}

export interface MatrixShelf {
  key: string;
  /** the rail plate, e.g. "Shelf 5" */
  label: string;
  occupied: number;
  capacity: number;
  columns: MatrixColumn[];
}

/** Left rail, and the narrowest / widest a cell may get — cells stay slim
 * rather than stretching across the whole card. */
const RAIL_W = 92;
const CELL_MIN = 64;
const CELL_MAX = 104;

export function RackMatrix({
  shelves,
  columnLabels,
  onSelect,
  ariaLabel,
  className,
}: {
  /** in the order the rail reads, top to bottom */
  shelves: MatrixShelf[];
  columnLabels: string[];
  onSelect: (tray: MatrixTray) => void;
  ariaLabel: string;
  className?: string | undefined;
}) {
  const template = {
    gridTemplateColumns: `${RAIL_W}px repeat(${columnLabels.length}, minmax(${CELL_MIN}px, ${CELL_MAX}px))`,
  };
  const minWidth = RAIL_W + columnLabels.length * CELL_MIN + (columnLabels.length + 1) * 8;

  return (
    <div className={cn("overflow-x-auto", className)}>
      <div role="grid" aria-label={ariaLabel} className="space-y-2" style={{ minWidth }}>
        <div role="row" className="grid gap-2" style={template}>
          <div role="columnheader" className="text-xs font-medium text-text-muted">
            <span className="sr-only">Shelf</span>
          </div>
          {columnLabels.map((label) => (
            <div
              key={label}
              role="columnheader"
              className="truncate pb-0.5 text-center text-xs font-semibold text-text-secondary"
            >
              {label}
            </div>
          ))}
        </div>

        {shelves.map((shelf) => (
          <div key={shelf.key} role="row" className="grid gap-2" style={template}>
            {/* the rail plate, aligned with its own row of cells */}
            <div
              role="rowheader"
              className="flex flex-col justify-center rounded-[var(--radius-md)] bg-surface-2 px-3 py-2"
            >
              <span className="text-sm font-semibold text-text">{shelf.label}</span>
              <span className="text-xs tabular-nums text-text-secondary">
                {shelf.occupied} / {shelf.capacity}
              </span>
            </div>

            {shelf.columns.map((column) => (
              <div
                key={column.key}
                role="gridcell"
                className="rounded-[var(--radius-md)] border border-border bg-surface p-1.5 shadow-[var(--shadow-sm)]"
              >
                {/* reversed: the caller sends trays ascending, the floor of the
                    column is the bottom of the cell */}
                <div className="flex flex-col-reverse gap-[2px]">
                  {column.trays.map((tray) => (
                    <TrayBar key={tray.key} tray={tray} onSelect={onSelect} />
                  ))}
                </div>
                {column.action ? (
                  <button
                    type="button"
                    title={column.action.title}
                    aria-pressed={column.action.active ?? false}
                    disabled={column.action.disabled}
                    onClick={column.action.onClick}
                    className={cn(
                      "ds-focus-ring mt-1.5 w-full truncate rounded-[3px] border px-1 py-0.5 text-[10px] font-semibold leading-tight transition-colors",
                      column.action.active
                        ? "border-primary bg-primary text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]"
                        : "border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] bg-[var(--color-primary-light)] text-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_16%,var(--color-surface))]",
                      "disabled:pointer-events-none disabled:opacity-40",
                    )}
                  >
                    {column.action.label}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** One tray. The only thing in the matrix the user actually clicks. */
function TrayBar({ tray, onSelect }: { tray: MatrixTray; onSelect: (tray: MatrixTray) => void }) {
  const disabled = tray.disabled ?? false;
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={tray.ariaLabel}
      aria-pressed={tray.selected ?? false}
      aria-disabled={disabled}
      title={tray.tooltip}
      onClick={disabled ? undefined : () => onSelect(tray)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(tray);
        }
      }}
      className={cn(
        "ds-focus-ring relative h-2.5 w-full rounded-[2px] transition-colors",
        disabled ? "cursor-default" : "cursor-pointer",
        tray.className,
        tray.suggested && !tray.selected && "ds-tray-suggested",
        tray.selected && "ring-2 ring-primary ring-offset-1 ring-offset-[var(--color-surface)]",
      )}
    >
      {tray.rank && !tray.selected ? (
        <span
          aria-hidden
          className="absolute right-0 top-1/2 z-10 flex h-3 min-w-3 -translate-y-1/2 items-center justify-center rounded-full bg-primary px-[3px] text-[8px] font-bold leading-none text-[var(--color-primary-fg)]"
        >
          {tray.rank}
        </span>
      ) : null}
    </div>
  );
}
