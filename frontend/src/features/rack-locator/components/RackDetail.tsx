"use client";

import { Layers, Rows3, Grid2x2, PackageOpen } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import type { Recommendation, RackDetail as RackDetailData, SelectedLocation, Tray } from "../types";
import { ShelfRow } from "./ShelfRow";
import { RACK_STATE, TRAY_LEGEND, TRAY_STATE, num, pct } from "./trayStyles";

/**
 * The hero: one rack drawn as it physically stands, top shelf first.
 *
 * Nothing about the geometry is assumed — the shelves, the rows inside each
 * shelf and the trays inside each row are exactly what the service returned.
 */
export function RackDetailView({
  detail,
  selected,
  recommendations,
  onSelect,
  className,
}: {
  detail: RackDetailData;
  selected: SelectedLocation | null;
  recommendations: Recommendation[];
  onSelect: (location: SelectedLocation) => void;
  className?: string;
}) {
  const { occupancy } = detail;
  const state = RACK_STATE[detail.state];

  function handleSelect(tray: Tray, shelfNo: number, rowNo: number) {
    onSelect({
      warehouse_code: detail.warehouse_code,
      aisle_code: detail.aisle_code,
      rack_code: detail.rack_code,
      shelf_no: shelfNo,
      row_no: rowNo,
      tray_no: tray.tray_no,
      code: tray.code,
      id: tray.id,
      state: tray.state,
    });
  }

  return (
    <section
      className={cn(
        "rounded-[var(--radius-md)] border border-border bg-surface",
        className,
      )}
      aria-label={`Rack ${detail.rack_code}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">
            {detail.rack_name ?? `Rack ${detail.rack_code}`}
          </h2>
          <span className="text-xs text-text-secondary">
            Aisle {detail.aisle_code} · {detail.warehouse_code}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge label={state.label} tone={state.tone} />
        </div>
      </header>

      {/* the rack's own numbers, all server-derived */}
      <dl className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-4">
        <Stat icon={<Layers />} label="Shelves" value={num(detail.shelf_count)} />
        <Stat icon={<Rows3 />} label="Rows / shelf" value={num(detail.row_count)} />
        <Stat icon={<Grid2x2 />} label="Trays / row" value={num(detail.tray_count)} />
        <Stat
          icon={<PackageOpen />}
          label="Empty"
          value={num(occupancy.empty)}
          hint={`${pct(occupancy.availability_pct)} of ${num(occupancy.capacity)}`}
        />
      </dl>

      {/* the rack itself — scrolls sideways on narrow screens, never squashes */}
      <div className="overflow-x-auto p-4">
        <div className="w-fit space-y-1.5">
          {/* top cap beam */}
          <div
            className="ml-[52px] h-1.5 rounded-[2px] bg-[color-mix(in_srgb,var(--color-teal-900)_45%,transparent)]"
            aria-hidden
          />
          {detail.shelves.map((shelf) => (
            <ShelfRow
              key={shelf.shelf_no}
              shelf={shelf}
              selected={selected}
              recommendations={recommendations}
              onSelect={handleSelect}
            />
          ))}
          {/* floor beam + feet */}
          <div
            className="ml-[52px] h-2 rounded-[2px] bg-[color-mix(in_srgb,var(--color-teal-900)_55%,transparent)]"
            aria-hidden
          />
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-border px-4 py-2.5">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {TRAY_LEGEND.map((s) => (
            <li key={s} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span
                className={cn(
                  "size-3 rounded-[2px] border",
                  TRAY_STATE[s].swatch,
                )}
                aria-hidden
              />
              {TRAY_STATE[s].label}
            </li>
          ))}
          <li className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span
              className="size-3 rounded-[2px] border border-primary bg-teal-100 dark:bg-[#164e57]"
              aria-hidden
            />
            Selected
          </li>
        </ul>
        <p className="text-xs tabular-nums text-text-muted">
          {num(occupancy.occupied)} occupied · {num(occupancy.empty)} empty ·{" "}
          {num(occupancy.capacity)} trays
        </p>
      </footer>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3">
      <span className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] bg-teal-50 text-teal-700 [&>svg]:size-3.5 dark:bg-[#12333a] dark:text-teal-300">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
          {label}
        </dt>
        <dd className="truncate text-sm font-semibold tabular-nums">
          {value}
          {hint ? (
            <span className="ml-1.5 text-xs font-normal text-text-muted">{hint}</span>
          ) : null}
        </dd>
      </div>
    </div>
  );
}
