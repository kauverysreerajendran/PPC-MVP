"use client";

import { Boxes, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFindPlacements } from "../hooks";
import type { Placement } from "../types";
import { num } from "./trayStyles";

const FIELD_LABEL = {
  model_no: "Model",
  lot_no: "Lot",
  sap_reference_id: "SAP doc",
} as const;

/**
 * "Where is model 90148?" — every tray it currently sits in, anywhere in the
 * warehouse, straight from the backend (`GET /rack/find`). Click one to jump
 * the rack view to it.
 */
export function ModelPlacements({
  query,
  selectedCode,
  onPick,
  onClose,
}: {
  query: string | null;
  selectedCode?: string | undefined;
  onPick: (p: Placement) => void;
  onClose: () => void;
}) {
  const find = useFindPlacements(query ? { q: query } : null);
  if (!query) return null;

  const data = find.data;
  const byRack = new Map<string, Placement[]>();
  for (const p of data?.placements ?? []) {
    const key = `${p.aisle_code}-${p.rack_code}`;
    const list = byRack.get(key) ?? [];
    list.push(p);
    byRack.set(key, list);
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text">
          <Boxes className="size-3.5 text-primary" />
          {data ? FIELD_LABEL[data.field] : "Model"} “{query}”
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Clear"
          className="ds-focus-ring rounded p-0.5 text-text-muted hover:text-text"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {find.isLoading ? (
        <p className="py-4 text-center text-xs text-text-secondary">Searching…</p>
      ) : !data || data.count === 0 ? (
        <p className="py-4 text-center text-xs text-text-secondary">
          Not stored in any tray.
        </p>
      ) : (
        <>
          <p className="mb-2 text-[11px] tabular-nums text-text-muted">
            {num(data.count)} trays
            {data.total_qty != null ? ` · qty ${num(data.total_qty)}` : ""} ·{" "}
            {byRack.size} racks
          </p>
          <div className="max-h-[280px] space-y-2 overflow-y-auto">
            {[...byRack.entries()].map(([rackKey, trays]) => (
              <div key={rackKey}>
                <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  {rackKey} · {trays.length}
                </p>
                <ul className="mt-0.5">
                  {trays.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onPick(p)}
                        aria-current={p.code === selectedCode ? "true" : undefined}
                        className={cn(
                          "ds-focus-ring flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-left text-xs transition-colors",
                          p.code === selectedCode
                            ? "bg-teal-50 dark:bg-[#12333a]"
                            : "hover:bg-surface-2",
                        )}
                      >
                        <span className="truncate font-mono tabular-nums text-text-secondary">
                          S{p.shelf_no}-R{p.row_no}-T{String(p.tray_no).padStart(2, "0")}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-text-muted">
                          {p.qty != null ? num(p.qty) : "—"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
