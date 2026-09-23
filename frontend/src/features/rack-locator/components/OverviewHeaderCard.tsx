"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, LocateFixed, PackagePlus, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { OccupancyTone } from "./trayStyles";
import type { LocationCrumb } from "./LocationBreadcrumb";
import type { WarehouseSummary } from "../types";
import { LocationBreadcrumb } from "./LocationBreadcrumb";
import { OCCUPANCY_LEGEND, OCCUPANCY_SCALE, num, pct } from "./trayStyles";
import { PendingPlacementsPanel, usePendingPlacements } from "./placement/PendingPlacementsStrip";

/**
 * The Rack Locator's one header surface.
 *
 * What used to be four stacked blocks — the pending-lots strip, the control
 * bar, the breadcrumb and RackOverview's occupancy summary — reads as a single
 * row: where you are on the left, what the warehouse looks like in the middle,
 * what you can do on the right. The occupancy half only appears in overview
 * mode; with a rack open the same card carries the breadcrumb and the
 * controls, so the page never swaps one header for another.
 *
 * It owns no state of its own. The occupancy filter lives in RackLocatorView
 * so the legend here and the dimming in AisleMap stay the same toggle.
 */
export function OverviewHeaderCard({
  warehouse,
  warehouses,
  activeWarehouseCode,
  onSelectWarehouse,
  crumbs,
  showOccupancy,
  filter,
  onToggleFilter,
  searchField,
  onFind,
  findLoading,
  onLocate,
  locateLoading,
  locateLabel,
  pendingOpen,
  onTogglePending,
}: {
  warehouse: WarehouseSummary | undefined;
  warehouses: WarehouseSummary[];
  activeWarehouseCode: string;
  onSelectWarehouse: (code: string) => void;
  crumbs: LocationCrumb[];
  showOccupancy: boolean;
  filter: OccupancyTone | null;
  onToggleFilter: (tone: OccupancyTone) => void;
  searchField: ReactNode;
  onFind: () => void;
  findLoading: boolean;
  onLocate: () => void;
  locateLoading: boolean;
  locateLabel: string;
  pendingOpen: boolean;
  onTogglePending: () => void;
}) {
  const { pending, isLoading: pendingLoading } = usePendingPlacements();

  // Rack counts per occupancy state — the bar and the legend read the same
  // numbers, so a segment and its chip can never disagree.
  const allRacks = warehouse?.aisles.flatMap((a) => a.racks) ?? [];
  const counts = OCCUPANCY_LEGEND.reduce(
    (acc, tone) => {
      acc[tone] = allRacks.filter((r) => r.state === tone).length;
      return acc;
    },
    {} as Record<OccupancyTone, number>,
  );
  const total = allRacks.length || 1;
  const occupancy = showOccupancy && warehouse;

  // The card names the warehouse itself, so a leading "Warehouse CBFC" crumb
  // would say it twice in the same row — and it only ever navigated back to
  // where the card already is. Every deeper crumb is kept as it was.
  const trail = warehouse && crumbs[0]?.kind === "Warehouse" ? crumbs.slice(1) : crumbs;

  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-3 px-4 py-3">
        {warehouse ? (
          <div className="flex min-w-0 items-center gap-2">
            <Warehouse className="size-4 shrink-0 text-text-muted" />
            <h2 className="truncate text-sm font-semibold">
              {warehouse.warehouse_name ?? warehouse.warehouse_code}
            </h2>
            <span className="shrink-0 text-xs text-text-muted">{warehouse.warehouse_code}</span>
          </div>
        ) : null}

        {warehouses.length > 1 ? (
          <div className="flex items-center gap-1 rounded-full border border-border p-1">
            {warehouses.map((w) => (
              <button
                key={w.warehouse_code}
                type="button"
                onClick={() => onSelectWarehouse(w.warehouse_code)}
                aria-pressed={w.warehouse_code === activeWarehouseCode}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  w.warehouse_code === activeWarehouseCode
                    ? "bg-primary text-[var(--color-primary-fg)]"
                    : "text-text-secondary hover:bg-surface-2",
                )}
              >
                {w.warehouse_name ?? w.warehouse_code}
              </button>
            ))}
          </div>
        ) : null}

        {trail.length > 0 ? <LocationBreadcrumb crumbs={trail} /> : null}

        {occupancy ? (
          <>
            <p className="text-xs tabular-nums text-text-secondary">
              {num(warehouse.rack_count)} racks · {num(warehouse.occupancy.empty)} of{" "}
              {num(warehouse.occupancy.capacity)} trays free ·{" "}
              {pct(warehouse.occupancy.occupancy_pct)} occupied
            </p>

            {/* 5-segment stacked bar — counts of racks per occupancy state */}
            <div
              className="flex h-2.5 w-20 shrink-0 overflow-hidden rounded-full"
              role="img"
              aria-label="Racks by occupancy state"
            >
              {OCCUPANCY_LEGEND.map((tone) =>
                counts[tone] > 0 ? (
                  <button
                    key={tone}
                    type="button"
                    title={`${OCCUPANCY_SCALE[tone].label}: ${counts[tone]} racks`}
                    onClick={() => onToggleFilter(tone)}
                    className={cn(
                      OCCUPANCY_SCALE[tone].fill,
                      "h-full transition-opacity hover:opacity-80",
                      filter && filter !== tone && "opacity-30",
                    )}
                    style={{ width: `${(counts[tone] / total) * 100}%` }}
                  />
                ) : null,
              )}
            </div>

            {/* legend — the only one shown in overview mode */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {OCCUPANCY_LEGEND.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => onToggleFilter(tone)}
                  aria-pressed={filter === tone}
                  aria-label={`Show only ${OCCUPANCY_SCALE[tone].label} racks (${counts[tone]})`}
                  title={`${OCCUPANCY_SCALE[tone].label}: ${counts[tone]} racks`}
                  className={cn(
                    "ds-focus-ring flex items-center gap-1.5 rounded-[var(--radius-xs)] px-1 py-0.5 text-xs transition-opacity",
                    filter && filter !== tone && "opacity-40",
                  )}
                >
                  <span
                    className={cn("size-2.5 rounded-[2px]", OCCUPANCY_SCALE[tone].fill)}
                    aria-hidden
                  />
                  <span className="tabular-nums text-text-muted">{counts[tone]}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {/* everything from here is pushed right on a wide screen */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onTogglePending}
            aria-expanded={pendingOpen}
            title="Received lots waiting for a rack"
            className="ds-focus-ring flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2"
          >
            <PackagePlus className="size-3.5 text-primary" />
            {pendingLoading ? null : (
              <span className="rounded-full bg-surface-2 px-1.5 tabular-nums">
                {pending.length}
              </span>
            )}
            {pendingOpen ? (
              <ChevronUp className="size-3.5 text-text-muted" />
            ) : (
              <ChevronDown className="size-3.5 text-text-muted" />
            )}
          </button>

          {searchField}

          <Button variant="secondary" size="md" loading={findLoading} onClick={onFind}>
            Find
          </Button>

          <Button size="md" loading={locateLoading} onClick={onLocate}>
            <LocateFixed className="size-4" />
            {locateLabel}
          </Button>
        </div>
      </div>

      {pendingOpen ? <PendingPlacementsPanel /> : null}
    </div>
  );
}
