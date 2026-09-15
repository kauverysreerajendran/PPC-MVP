"use client";

import { LayoutGrid, Package, PieChart, Rows3 } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import type {
  Recommendation,
  RackDetail as RackDetailData,
  SelectedLocation,
  Tray,
} from "../types";
import { ShelfRow } from "./ShelfRow";
import { RACK_STATE, SELECTED_TRAY, TRAY_LEGEND, TRAY_STATE, num, pct } from "./trayStyles";

/**
 * The hero: one rack drawn as it physically stands, top shelf first.
 *
 * Nothing about the geometry is assumed — shelves, the rows within each shelf
 * and the trays within each row are exactly what the service returned.
 */
export function RackDetailView({
  detail,
  selected,
  recommendations,
  onSelect,
  className,
  pickerMode,
}: {
  detail: RackDetailData;
  selected: SelectedLocation | null;
  recommendations: Recommendation[];
  onSelect: (location: SelectedLocation) => void;
  className?: string;
  /** Placement tray picker: restrict picking to empty/reserved trays, with
   * occupied/blocked trays disabled and labelled rather than a no-op click. */
  pickerMode?: boolean | undefined;
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
      occupied_by_model: tray.occupied_by_model,
      qty: tray.qty,
      lot_no: tray.lot_no,
      sap_reference_id: tray.sap_reference_id,
    });
  }

  return (
    <section
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]",
        className,
      )}
      aria-label={`Rack ${detail.rack_code}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-semibold text-text">
            Rack {detail.rack_code}{" "}
            <span className="font-normal text-text-secondary">
              (Aisle {detail.aisle_code})
            </span>
          </h2>
          <StatusBadge label={state.label} tone={state.tone} />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
          <Stat icon={<LayoutGrid />} value={num(detail.shelf_count)} label="Shelves" />
          <Stat icon={<Rows3 />} value={num(detail.row_count)} label="Rows / Shelf" />
          <Stat icon={<Package />} value={num(detail.tray_count)} label="Trays / Row" />
          <Stat
            icon={<PieChart />}
            value={pct(occupancy.availability_pct)}
            label="Empty"
          />
        </div>
      </div>

      {/* the rack — scrolls sideways on narrow screens, never squashes */}
      <div className="overflow-x-auto">
        <div className="min-w-[520px] space-y-2.5">
          {detail.shelves.map((shelf) => (
            <ShelfRow
              key={shelf.shelf_no}
              shelf={shelf}
              rowCount={detail.row_count}
              selected={selected}
              recommendations={recommendations}
              onSelect={handleSelect}
              pickerMode={pickerMode}
            />
          ))}
        </div>
      </div>

      {/* legend */}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-text-secondary">
        {TRAY_LEGEND.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className={cn("size-3 rounded-[var(--radius-xs)] border", TRAY_STATE[s].swatch)}
              aria-hidden
            />
            {TRAY_STATE[s].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span
            className={cn("size-3 rounded-[var(--radius-xs)] border", SELECTED_TRAY.swatch)}
            aria-hidden
          />
          {SELECTED_TRAY.label}
        </span>
        <span className="ml-auto tabular-nums text-text-muted">
          {num(occupancy.occupied)} occupied · {num(occupancy.empty)} empty ·{" "}
          {num(occupancy.capacity)} trays
        </span>
      </div>
    </section>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-text-muted [&>svg]:size-3.5">{icon}</span>
      <span className="font-semibold tabular-nums text-text">{value}</span>
      <span className="text-text-muted">{label}</span>
    </span>
  );
}
