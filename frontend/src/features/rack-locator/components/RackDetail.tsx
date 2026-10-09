"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { RackMatrix, type MatrixShelf, type MatrixTray } from "@/components/rack";
import { cn } from "@/lib/cn";
import type {
  Recommendation,
  RackDetail as RackDetailData,
  SelectedLocation,
  SlotState,
  Tray,
} from "../types";
import { DEFAULT_TRAY_CAPACITY_QTY } from "../trayCapacity";
import { ViewModeToggle } from "./three/ViewModeToggle";
import { canUseWebGL, useLocatorViewMode } from "./three/sceneKit";
import {
  BAY_TRAY,
  SELECTED_BAR,
  SUGGESTED_BAR,
  TRAY_BAR,
  TRAY_STATE,
} from "./trayStyles";

// three.js is heavy and browser-only — load the 3D rack after the page.
const RackBay3D = dynamic(() => import("./three/RackBay3D").then((m) => m.RackBay3D), {
  ssr: false,
  loading: () => (
    <div className="h-[clamp(440px,60vh,580px)] animate-pulse rounded-[var(--radius-md)] bg-surface-2" />
  ),
});

const LEGEND_STATES: SlotState[] = ["empty", "occupied", "reserved", "blocked"];

/**
 * The hero: one rack as a shelf x column matrix, Shelf 1 at the top — drawn in
 * 3D (`three/RackBay3D`) by default, or flat as `RackMatrix` on the Grid toggle
 * or when WebGL is missing. Both read the same `shelves` built below.
 *
 * Nothing about the geometry is assumed — shelves, the rows within each shelf
 * and the trays within each row are exactly what the service returned. This
 * component's only job is to turn that response into the structural shape
 * `RackMatrix` draws, and to turn a click on a drawn tray back into a
 * `SelectedLocation`.
 *
 * Vocabulary note: the service calls the second axis a *row* (`row_no`), which
 * is what every field here is still named. To a picker standing in the aisle
 * they are the vertical columns of a shelf, so that is what the labels say.
 */
export function RackDetailView({
  detail,
  selected,
  recommendations,
  suggestedCodes,
  onSelect,
  className,
  pickerMode,
  chosenCodes,
  onSelectColumn,
}: {
  detail: RackDetailData;
  selected: SelectedLocation | null;
  recommendations: Recommendation[];
  /** codes of the trays the backend is suggesting right now — they pulse until
   * taken; anything not free is never in here */
  suggestedCodes?: readonly string[] | undefined;
  onSelect: (location: SelectedLocation) => void;
  className?: string;
  /** Placement tray picker: restrict picking to empty/reserved trays, with
   * occupied/blocked trays disabled and labelled rather than a no-op click. */
  pickerMode?: boolean | undefined;
  /** trays already chosen for the line being placed (picker mode) */
  chosenCodes?: readonly string[] | undefined;
  /** picker mode: take — or, when all are taken, give back — every free tray
   * of one column in one click; receives that column's free trays, tray 1 up */
  onSelectColumn?: ((trays: SelectedLocation[]) => void) | undefined;
}) {
  const mode = useLocatorViewMode();
  const [noGl, setNoGl] = useState(false);
  const glOk = !noGl && canUseWebGL();
  const show3d = mode === "3d" && glOk;
  const [slotFilter, setSlotFilter] = useState<SlotState | null>(null);
  const rackTitle = detail.rack_name ?? `Rack ${detail.rack_code}`;

  // every tray on the drawing, indexed by its location code, so a click on a
  // drawn bar lands back on the exact tray the service sent
  const trayIndex = useMemo(() => {
    const map = new Map<string, { tray: Tray; shelfNo: number; rowNo: number }>();
    for (const shelf of detail.shelves) {
      for (const row of shelf.rows) {
        for (const tray of row.trays) {
          map.set(tray.code, { tray, shelfNo: shelf.shelf_no, rowNo: row.row_no });
        }
      }
    }
    return map;
  }, [detail.shelves]);

  // Shelf 1 at the top, reading down — whatever order the service sends
  const orderedShelves = useMemo(
    () => [...detail.shelves].sort((a, b) => a.shelf_no - b.shelf_no),
    [detail.shelves],
  );

  // the column labels come from the service too
  const columnLabels = useMemo(
    () =>
      detail.shelves[0]?.rows.map((row) => `Column ${row.row_no}`) ??
      Array.from({ length: detail.row_count }, (_, i) => `Column ${i + 1}`),
    [detail.shelves, detail.row_count],
  );

  const suggested = useMemo(() => new Set(suggestedCodes ?? []), [suggestedCodes]);
  const chosen = useMemo(() => new Set(chosenCodes ?? []), [chosenCodes]);

  const shelves: MatrixShelf[] = useMemo(() => {
    const rankOf = (code: string) => recommendations.find((r) => r.code === code)?.rank;

    const toLocation = (shelfNo: number, rowNo: number, tray: Tray): SelectedLocation => ({
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

    /** "All empty" on a column in picker mode: every free tray, one click. */
    const columnAction = (shelfNo: number, rowNo: number, trays: Tray[]) => {
      if (!pickerMode || !onSelectColumn) return undefined;
      const free = trays
        .filter((t) => t.id && (t.state === "empty" || t.state === "reserved"))
        .sort((a, b) => a.tray_no - b.tray_no);
      const allTaken = free.length > 0 && free.every((t) => chosen.has(t.code));
      return {
        label: allTaken ? "Clear" : free.length > 0 ? `All empty · ${free.length}` : "Full",
        title: allTaken
          ? `Give back the ${free.length} tray${free.length === 1 ? "" : "s"} chosen in shelf ${shelfNo}, column ${rowNo}`
          : `Choose every empty tray in shelf ${shelfNo}, column ${rowNo}`,
        disabled: free.length === 0,
        active: allTaken,
        onClick: () => onSelectColumn(free.map((t) => toLocation(shelfNo, rowNo, t))),
      };
    };

    return orderedShelves.map((shelf) => ({
      key: `s${shelf.shelf_no}`,
      label: `Shelf ${shelf.shelf_no}`,
      occupied: shelf.occupancy.occupied,
      capacity: shelf.occupancy.capacity,
      columns: shelf.rows.map((row) => ({
        key: `s${shelf.shelf_no}-r${row.row_no}`,
        action: columnAction(shelf.shelf_no, row.row_no, row.trays),
        trays: row.trays.map((tray): MatrixTray => {
          const selectable = tray.state === "empty" || tray.state === "reserved";
          const isSelected = selected?.code === tray.code;
          const rank = rankOf(tray.code);
          const stateLabel = TRAY_STATE[tray.state].label.replace(" Tray", "");
          // only a free tray is ever suggested, and it stops the moment it is taken
          const isSuggested = selectable && !isSelected && suggested.has(tray.code);
          const tooltip =
            tray.state === "occupied"
              ? pickerMode
                ? `${tray.code} · occupied by ${tray.occupied_by_model ?? "another model"}`
                : [
                    tray.code,
                    tray.occupied_by_model ?? "Occupied",
                    tray.lot_no,
                    tray.qty != null ? `qty ${tray.qty}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
              : [
                  `${tray.code} · ${stateLabel}`,
                  `holds up to ${DEFAULT_TRAY_CAPACITY_QTY} qty`,
                  isSuggested && rank ? `Suggested #${rank}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

          // selection outlines the bar and a suggestion tints it teal; neither
          // recolours a plain filled/empty bar away from the two-tone read.
          // Occupancy wins: a filled tray paints filled even while it is still
          // selected (the ring still marks it), so a stale selection can never
          // hide what is really in the rack.
          const paint =
            tray.state === "occupied"
              ? TRAY_BAR.occupied.className
              : isSelected
                ? SELECTED_BAR.className
                : rank
                  ? SUGGESTED_BAR.className
                  : TRAY_BAR[tray.state].className;

          return {
            key: tray.code,
            number: tray.tray_no,
            state: tray.state,
            className: paint,
            selected: isSelected,
            suggested: isSuggested,
            rank,
            // in the picker only free trays are live; outside it an occupied
            // tray is still worth clicking, to read what is in it
            disabled: pickerMode ? !selectable : !selectable && tray.state !== "occupied",
            tooltip,
            ariaLabel: `Shelf ${shelf.shelf_no}, column ${row.row_no}, tray ${String(
              tray.tray_no,
            ).padStart(2, "0")}, ${stateLabel}${
              isSuggested
                ? `, suggested tray ${rank ?? ""}`.trimEnd()
                : rank
                  ? `, suggestion ${rank}`
                  : ""
            }`,
          };
        }),
      })),
    }));
  }, [
    orderedShelves,
    detail.warehouse_code,
    detail.aisle_code,
    detail.rack_code,
    recommendations,
    selected?.code,
    pickerMode,
    suggested,
    chosen,
    onSelectColumn,
  ]);

  function handleSelect(bar: MatrixTray) {
    const hit = trayIndex.get(bar.key);
    if (!hit) return;
    const { tray, shelfNo, rowNo } = hit;
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


  const ariaLabel = `${rackTitle}, ${detail.shelf_count} shelves of ${detail.row_count} columns, ${detail.tray_count} trays each`;

  return (
    <section
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-surface p-3 shadow-[var(--shadow-sm)]",
        className,
      )}
      aria-label={`Rack ${detail.rack_code}`}
    >
      {/* view tabs on the left, the state key on the right — in 3D the key
          doubles as a filter that dims every tray in another state */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {glOk ? <ViewModeToggle mode={show3d ? "3d" : "grid"} variant="tabs" /> : <span />}
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-1 shadow-[var(--shadow-sm)]">
          {LEGEND_STATES.map((st) => {
            const on = slotFilter === st;
            const swatch = show3d ? BAY_TRAY[st].className : TRAY_BAR[st].className;
            const label = BAY_TRAY[st].label;
            return show3d ? (
              <button
                key={st}
                type="button"
                onClick={() => setSlotFilter(on ? null : st)}
                aria-pressed={on}
                title={on ? "Show every tray" : `Show only ${label.toLowerCase()} trays`}
                className={cn(
                  "ds-focus-ring inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
                  on ? "bg-surface-2 text-text ring-1 ring-border-strong" : "text-text-secondary hover:text-text",
                  slotFilter && !on && "opacity-50",
                )}
              >
                <span className={cn("size-2.5 rounded-full", swatch)} aria-hidden />
                {label}
              </button>
            ) : (
              <span key={st} className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium text-text-secondary">
                <span className={cn("size-2.5 rounded-full", swatch)} aria-hidden />
                {label}
              </span>
            );
          })}
        </div>
      </div>

      {show3d ? (
        <RackBay3D
          shelves={shelves}
          columnLabels={columnLabels}
          onSelect={handleSelect}
          ariaLabel={ariaLabel}
          onNoWebGL={() => setNoGl(true)}
          slotFilter={slotFilter}
        />
      ) : (
        <div className="min-w-0 px-1 pb-1">
          <RackMatrix
            shelves={shelves}
            columnLabels={columnLabels}
            onSelect={handleSelect}
            ariaLabel={ariaLabel}
          />
        </div>
      )}
    </section>
  );
}
