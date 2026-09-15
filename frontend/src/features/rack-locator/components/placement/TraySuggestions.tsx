"use client";

import { useState } from "react";
import { Boxes, Pencil, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ChosenTray } from "../../types";
import { TrayPickerModal } from "./TrayPickerModal";

/**
 * Step 2 of the placement flow: one large tray card per piece, numbered.
 * "Change" opens the tray picker for that piece's rack; the X drops that
 * piece for now (partial placement stays possible, as it was before this
 * flow existed); "Suggest again" re-runs the whole-warehouse search from
 * PlacementFlow.
 */
export function TraySuggestions({
  remaining,
  chosen,
  qtyForPiece,
  freeCountOf,
  suggesting,
  onSuggestAgain,
  onChangePiece,
  onSkipPiece,
  noFreeTray,
  warehouseName,
  occupancyLine,
}: {
  remaining: number;
  chosen: ChosenTray[];
  qtyForPiece: (index: number) => number | null;
  freeCountOf: (rackCode: string) => number | null;
  suggesting: boolean;
  onSuggestAgain: () => void;
  onChangePiece: (index: number, tray: ChosenTray) => void;
  onSkipPiece: (index: number) => void;
  noFreeTray: boolean;
  warehouseName: string;
  occupancyLine: string;
}) {
  const [changing, setChanging] = useState<number | null>(null);
  const active = changing != null ? chosen[changing] : null;

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text">
          <Boxes className="size-4 text-primary" />
          Trays for {remaining} piece{remaining === 1 ? "" : "s"}
        </h2>
        <Button variant="secondary" size="sm" loading={suggesting} onClick={onSuggestAgain}>
          <Sparkles className="size-3.5" />
          Suggest again
        </Button>
      </div>

      {suggesting && chosen.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: Math.min(remaining, 3) || 1 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-[var(--radius-md)]" />
          ))}
        </div>
      ) : noFreeTray ? (
        <p className="py-8 text-center text-sm text-text-secondary">
          No empty tray in warehouse <span className="font-medium text-text">{warehouseName}</span>.
          <br />
          <span className="text-xs">{occupancyLine}</span>
        </p>
      ) : chosen.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-secondary">
          No trays suggested yet — click <span className="font-medium text-text">Suggest again</span>.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {chosen.map((c, i) => {
            const qty = qtyForPiece(i);
            const free = freeCountOf(c.rack_code);
            return (
              <li
                key={c.code}
                className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-[var(--color-primary-fg)]">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-text">
                      Piece {i + 1}
                      {qty != null ? (
                        <span className="ml-1 font-normal text-text-secondary">· {qty} pcs</span>
                      ) : null}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onSkipPiece(i)}
                    title="Skip this piece for now"
                    aria-label={`Skip piece ${i + 1}`}
                    className="ds-focus-ring shrink-0 rounded p-1 text-text-muted hover:bg-surface hover:text-text"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <p className="text-sm tabular-nums text-text">
                  Aisle {c.aisle_code} · Rack {c.rack_code} · Shelf {c.shelf_no} · Row {c.row_no} ·
                  Tray {String(c.tray_no).padStart(2, "0")}
                </p>
                {free != null ? (
                  <p className="text-xs text-text-muted">{free} free in this rack</p>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-auto self-start"
                  onClick={() => setChanging(i)}
                >
                  <Pencil className="size-3.5" />
                  Change
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <TrayPickerModal
        open={changing != null}
        onClose={() => setChanging(null)}
        rack={
          active
            ? {
                warehouse_code: active.warehouse_code,
                aisle_code: active.aisle_code,
                rack_code: active.rack_code,
              }
            : null
        }
        excludeCodes={chosen.filter((_, i) => i !== changing).map((c) => c.code)}
        onPick={(tray) => {
          if (changing != null) onChangePiece(changing, tray);
        }}
      />
    </div>
  );
}
