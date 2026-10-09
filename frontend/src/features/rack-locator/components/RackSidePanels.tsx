"use client";

import {
  Archive,
  Columns3,
  Database,
  Info,
  LayoutGrid,
  Layers,
  ListChecks,
  PackageCheck,
  PackageOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { AisleSummary, RackDetail, RackSummary } from "../types";
import { canUseWebGL, useLocatorViewMode } from "./three/sceneKit";
import { BAY_LEGEND, TRAY_BAR_LEGEND, num } from "./trayStyles";

/**
 * The cards that ride beside the rack: what the open rack holds (with a picker
 * to hop to another rack in the aisle, or back to the rack list) and the tray
 * colour key. Every figure is read off the live rack-detail response.
 */

const CARD = "rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]";

export function RackSummaryCard({
  detail,
  racks,
  onPickRack,
}: {
  detail: RackDetail;
  /** the racks of this aisle, for the picker */
  racks: RackSummary[];
  /** another rack, or `null` for the aisle's rack list */
  onPickRack: (rackCode: string | null) => void;
}) {
  const { occupancy } = detail;
  const stats: { icon: LucideIcon; tint: string; label: string; value: number }[] = [
    { icon: Layers, tint: "text-[var(--color-empty)] bg-[var(--color-empty-bg)]", label: "Total Shelves", value: detail.shelf_count },
    { icon: Columns3, tint: "text-violet-600 bg-violet-50 dark:bg-violet-950/40", label: "Columns per Shelf", value: detail.row_count },
    { icon: Archive, tint: "text-primary bg-[var(--color-primary-light)]", label: "Trays per Column", value: detail.tray_count },
    { icon: Database, tint: "text-[var(--color-warning)] bg-[var(--color-warning-bg)]", label: "Total Capacity", value: occupancy.capacity },
    { icon: PackageCheck, tint: "text-text-secondary bg-surface-2", label: "Filled", value: occupancy.occupied },
    { icon: PackageOpen, tint: "text-[var(--color-empty)] bg-[var(--color-empty-bg)]", label: "Empty", value: occupancy.empty },
  ];
  const pct = Math.round(occupancy.occupancy_pct);
  // donut: r = 40 -> circumference ~251.3
  const C = 2 * Math.PI * 40;

  return (
    <section className={CARD} aria-label="Rack summary">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text">
          <Layers className="size-4 text-primary" aria-hidden />
          Rack Summary
        </h2>
        <select
          value={detail.rack_code}
          onChange={(e) => onPickRack(e.target.value || null)}
          aria-label="Open another rack"
          className="h-8 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 text-sm font-medium text-text outline-none focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)]"
        >
          <option value="">← All racks</option>
          {racks.map((r) => (
            <option key={r.rack_code} value={r.rack_code}>
              {r.rack_name ?? `Rack ${r.rack_code}`}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2.5">
        <dl className="space-y-1.5 rounded-[var(--radius-md)] bg-surface-2 p-2.5 text-xs">
          {stats.map(({ icon: Icon, tint, label, value }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-[6px]", tint)}>
                <Icon className="size-3" aria-hidden />
              </span>
              <dt className="min-w-0 flex-1 truncate text-text-secondary">{label}</dt>
              <dd className="font-semibold tabular-nums text-text">{num(value)}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col items-center justify-between rounded-[var(--radius-md)] bg-surface-2 p-2.5">
          <div className="relative size-[80px]">
            <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r="40" fill="none" strokeWidth="10" className="stroke-[var(--color-border)]" />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                className="stroke-primary transition-[stroke-dasharray] duration-500"
                strokeDasharray={`${(Math.min(100, Math.max(0, occupancy.occupancy_pct)) / 100) * C} ${C}`}
              />
            </svg>
            <div className="absolute inset-0 grid place-content-center text-center">
              <span className="text-lg font-bold leading-none tabular-nums text-text">{pct}%</span>
              <span className="mt-0.5 text-[10px] text-text-muted">Filled</span>
            </div>
          </div>
          <div className="mt-2 grid w-full grid-cols-2 gap-1 text-center text-[10px] text-text-secondary">
            <div>
              <div className="flex items-center justify-center gap-1">
                <span className="size-1.5 rounded-full bg-[var(--color-empty)]" aria-hidden />
                Empty
              </div>
              <div className="text-sm font-bold tabular-nums text-text">{num(occupancy.empty)}</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1">
                <span className="size-1.5 rounded-full bg-[var(--color-rack-upright)]" aria-hidden />
                Occupied
              </div>
              <div className="text-sm font-bold tabular-nums text-text">{num(occupancy.occupied)}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LegendCard() {
  const mode = useLocatorViewMode();
  const entries = mode === "3d" && canUseWebGL() ? BAY_LEGEND : TRAY_BAR_LEGEND;
  return (
    <section className={CARD} aria-label="Legend">
      <h2 className="mb-2.5 flex items-center gap-2 text-base font-semibold text-text">
        <ListChecks className="size-4 text-primary" aria-hidden />
        Legend
        <Info
          className="size-3.5 text-text-muted"
          aria-label="Tray colours in the rack view"
        />
      </h2>
      <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-text-secondary">
        {entries.map((entry) => (
          <li key={entry.label} className="flex items-center gap-1.5">
            <span className={cn("size-3 shrink-0 rounded-[3px]", entry.className)} aria-hidden />
            {entry.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The overview's summary: one aisle's racks at a glance, with a picker to
 * switch aisle. Shelves are summed across the racks; columns and trays are the
 * most any rack in the aisle has (racks in one aisle are usually alike).
 */
export function AisleSummaryCard({
  aisles,
  aisleCode,
  onPickAisle,
}: {
  aisles: AisleSummary[];
  aisleCode: string;
  onPickAisle: (aisleCode: string) => void;
}) {
  const aisle = aisles.find((a) => a.aisle_code === aisleCode);
  const racks = aisle?.racks ?? [];
  const most = (pick: (r: RackSummary) => number) => (racks.length ? Math.max(...racks.map(pick)) : 0);
  const tiles: { icon: LucideIcon; tint: string; label: string; value: number; title: string }[] = [
    { icon: LayoutGrid, tint: "text-[var(--color-empty)] bg-[var(--color-empty-bg)]", label: "Racks", value: racks.length, title: "Racks in this aisle" },
    { icon: Layers, tint: "text-primary bg-[var(--color-primary-light)]", label: "Shelves", value: racks.reduce((n, r) => n + r.shelf_count, 0), title: "Shelves across every rack in this aisle" },
    { icon: Columns3, tint: "text-violet-600 bg-violet-50 dark:bg-violet-950/40", label: "Columns", value: most((r) => r.row_count), title: "Columns per shelf (the most any rack has)" },
    { icon: Archive, tint: "text-[var(--color-success)] bg-[var(--color-success-bg)]", label: "Trays/Column", value: most((r) => r.tray_count), title: "Trays per column (the most any rack has)" },
  ];

  return (
    <section className={CARD} aria-label="Aisle summary">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text">
          <Layers className="size-4 text-primary" aria-hidden />
          Rack Summary
        </h2>
        <select
          value={aisleCode}
          onChange={(e) => onPickAisle(e.target.value)}
          aria-label="Aisle"
          disabled={aisles.length === 0}
          className="h-8 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 text-sm font-medium text-text outline-none focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)]"
        >
          {aisles.map((a) => (
            <option key={a.aisle_code} value={a.aisle_code}>
              {a.aisle_name ?? `Aisle ${a.aisle_code}`}
            </option>
          ))}
        </select>
      </div>
      <dl className="grid grid-cols-4 gap-2">
        {tiles.map(({ icon: Icon, tint, label, value, title }) => (
          <div
            key={label}
            title={title}
            className="flex flex-col items-center gap-1 rounded-[var(--radius-md)] border border-border bg-surface-2 px-1 py-2 text-center"
          >
            <span className={cn("grid size-6 place-items-center rounded-[7px]", tint)}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <dd className="text-base font-bold leading-none tabular-nums text-text">{num(value)}</dd>
            <dt className="text-[10px] leading-tight text-text-muted">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
