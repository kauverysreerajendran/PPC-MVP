"use client";

import type { ReactNode } from "react";
import {
  Box,
  ChevronDown,
  ChevronUp,
  Home,
  LayoutGrid,
  LocateFixed,
  PackagePlus,
  RefreshCw,
  Search,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { OccupancyTone } from "./trayStyles";
import type { LocationCrumb } from "./LocationBreadcrumb";
import type { WarehouseSummary } from "../types";
import { LocationBreadcrumb } from "./LocationBreadcrumb";
import { BAY_TRAY, OCCUPANCY_LEGEND, OCCUPANCY_SCALE, num, pct } from "./trayStyles";
import { usePendingPlacements } from "./placement/PendingPlacementsStrip";

/**
 * The Rack Locator's header content, carried by the page's wave banner rather
 * than a card of its own: `LocatorHeaderInfo` is the banner's subtitle line
 * (where you are, and — in overview mode — what the warehouse looks like),
 * `LocatorHeaderControls` sits with the banner's actions (pending lots, Find,
 * Locate Me). The pending lots panel itself opens under the banner; the page
 * owns that, and the occupancy filter, so the legend here and the dimming in
 * AisleMap stay the same toggle.
 */
export function LocatorHeaderInfo({
  warehouse,
  warehouses,
  activeWarehouseCode,
  onSelectWarehouse,
  crumbs,
  showOccupancy,
  filter,
  onToggleFilter,
}: {
  warehouse: WarehouseSummary | undefined;
  warehouses: WarehouseSummary[];
  activeWarehouseCode: string;
  onSelectWarehouse: (code: string) => void;
  crumbs: LocationCrumb[];
  showOccupancy: boolean;
  filter: OccupancyTone | null;
  onToggleFilter: (tone: OccupancyTone) => void;
}) {
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

  // The line names the warehouse itself, so a leading "Warehouse CBFC" crumb
  // would say it twice — and it only ever navigated back to where you are.
  const trail = warehouse && crumbs[0]?.kind === "Warehouse" ? crumbs.slice(1) : crumbs;

  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full bg-[color-mix(in_srgb,var(--color-surface)_72%,transparent)] px-2.5 py-0.5 text-xs backdrop-blur-sm">
      {warehouse ? (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Warehouse className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="truncate font-semibold text-text">
            {warehouse.warehouse_name ?? warehouse.warehouse_code}
          </span>
        </span>
      ) : null}

      {warehouses.length > 1 ? (
        <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface/70 p-0.5">
          {warehouses.map((w) => (
            <button
              key={w.warehouse_code}
              type="button"
              onClick={() => onSelectWarehouse(w.warehouse_code)}
              aria-pressed={w.warehouse_code === activeWarehouseCode}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                w.warehouse_code === activeWarehouseCode
                  ? "bg-primary text-[var(--color-primary-fg)]"
                  : "text-text-secondary hover:bg-surface-2",
              )}
            >
              {w.warehouse_code}
            </button>
          ))}
        </div>
      ) : null}

      {trail.length > 0 ? (
        <>
          <span className="text-text-muted" aria-hidden>
            ›
          </span>
          <LocationBreadcrumb crumbs={trail} className="gap-0.5" />
        </>
      ) : null}

      {occupancy ? (
        <>
          <span className="text-text-muted" aria-hidden>
            ·
          </span>
          <span className="tabular-nums text-text-secondary">
            {num(warehouse.rack_count)} racks · {num(warehouse.occupancy.empty)}/
            {num(warehouse.occupancy.capacity)} free · {pct(warehouse.occupancy.occupancy_pct)}{" "}
            occupied
          </span>

          {/* 5-segment stacked bar — counts of racks per occupancy state */}
          <div
            className="flex h-2 w-16 shrink-0 overflow-hidden rounded-full"
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
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
            {OCCUPANCY_LEGEND.map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => onToggleFilter(tone)}
                aria-pressed={filter === tone}
                aria-label={`Show only ${OCCUPANCY_SCALE[tone].label} racks (${counts[tone]})`}
                title={`${OCCUPANCY_SCALE[tone].label}: ${counts[tone]} racks`}
                className={cn(
                  "ds-focus-ring flex items-center gap-1 rounded-[var(--radius-xs)] px-1 py-0.5 transition-opacity",
                  filter && filter !== tone && "opacity-40",
                )}
              >
                <span
                  className={cn("size-2 rounded-[2px]", OCCUPANCY_SCALE[tone].fill)}
                  aria-hidden
                />
                <span className="tabular-nums text-text-muted">{counts[tone]}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function LocatorHeaderControls({
  searchField,
  onFind,
  findLoading,
  onLocate,
  locateLoading,
  locateLabel,
  pendingOpen,
  onTogglePending,
}: {
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

  return (
    <>
      <button
        type="button"
        onClick={onTogglePending}
        aria-expanded={pendingOpen}
        title="Received lots waiting for a rack"
        className="ds-focus-ring flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface/80 px-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2"
      >
        <PackagePlus className="size-3.5 text-primary" />
        {pendingLoading ? null : (
          <span className="rounded-full bg-surface-2 px-1.5 tabular-nums">{pending.length}</span>
        )}
        {pendingOpen ? (
          <ChevronUp className="size-3.5 text-text-muted" />
        ) : (
          <ChevronDown className="size-3.5 text-text-muted" />
        )}
      </button>

      {searchField}

      <Button variant="secondary" size="sm" loading={findLoading} onClick={onFind}>
        Find
      </Button>

      <Button size="sm" loading={locateLoading} onClick={onLocate}>
        <LocateFixed className="size-3.5" />
        {locateLabel}
      </Button>
    </>
  );
}

/**
 * The plain page head used while one rack is open: title and a line of what
 * the page is for on the left, where you are on the right. Every crumb but the
 * last steps back out (the warehouse and aisle back to the rack list).
 */
export function LocatorTitleRow({
  warehouseName,
  crumbs,
  subtitle,
  actions,
}: {
  warehouseName: string | undefined;
  crumbs: LocationCrumb[];
  subtitle: string;
  actions?: ReactNode;
}) {
  // the rack is as deep as this head goes; the tray lives in its own card
  const trail = crumbs.filter((c) => c.kind === "Warehouse" || c.kind === "Aisle" || c.kind === "Rack");
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-text">Rack Locator</h1>
        <p className="text-sm text-text-secondary">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <nav aria-label="Storage location" className="flex flex-wrap items-center gap-1.5 text-xs">
          <Home className="size-3.5 text-text-muted" aria-hidden />
          {trail.map((c, i) => {
            const last = i === trail.length - 1;
            const label =
              c.kind === "Warehouse" ? (warehouseName ?? c.value) : `${c.kind} ${c.value}`;
            return (
              <span key={`${c.kind}-${c.value}`} className="inline-flex items-center gap-1.5">
                <span className="text-text-muted" aria-hidden>
                  /
                </span>
                {c.onClick && !last ? (
                  <button
                    type="button"
                    onClick={c.onClick}
                    className="ds-focus-ring rounded px-0.5 text-text-secondary hover:text-primary"
                  >
                    {label}
                  </button>
                ) : (
                  <span className={last ? "font-medium text-text" : "text-text-secondary"}>{label}</span>
                )}
              </span>
            );
          })}
        </nav>
        {actions}
      </div>
    </div>
  );
}

const WHITE_CARD = "rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]";

/**
 * The overview's one control bar, a single card: where you are (warehouse ›
 * aisle, with its free / occupied figures), the tray colour key, how many
 * racks there are — then the actions: received lots waiting for a rack, the
 * location / model search, Find, Locate Me, refresh and (`trailing`) the
 * 3D / Grid tabs. It wraps onto a second line only on narrow screens.
 */
export function LocatorOverviewBar({
  warehouse,
  warehouses,
  activeWarehouseCode,
  onSelectWarehouse,
  crumbs,
  query,
  onQueryChange,
  onFind,
  findLoading,
  onLocate,
  locateLoading,
  locateLabel,
  pendingOpen,
  onTogglePending,
  onRefresh,
  refreshing,
  trailing,
}: {
  warehouse: WarehouseSummary | undefined;
  warehouses: WarehouseSummary[];
  activeWarehouseCode: string;
  onSelectWarehouse: (code: string) => void;
  crumbs: LocationCrumb[];
  query: string;
  onQueryChange: (q: string) => void;
  onFind: () => void;
  findLoading: boolean;
  onLocate: () => void;
  locateLoading: boolean;
  locateLabel: string;
  pendingOpen: boolean;
  onTogglePending: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  /** pushed to the right end, e.g. the 3D / Grid tabs */
  trailing?: ReactNode;
}) {
  const { pending, isLoading: pendingLoading } = usePendingPlacements();
  const aisle = crumbs.find((c) => c.kind === "Aisle");
  const control = "h-9 rounded-[10px] border border-border bg-surface";
  const divider = <span className="hidden h-8 w-px shrink-0 bg-border xl:block" aria-hidden />;

  return (
    <div className={cn(WHITE_CARD, "mb-4 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 px-4 py-2.5 xl:flex-nowrap")}>
      {/* where you are */}
      <div className="flex min-w-0 shrink-0 items-center gap-2.5">
        <Warehouse className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 leading-tight">
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="truncate font-semibold text-text">
              {warehouse?.warehouse_name ?? warehouse?.warehouse_code ?? "—"}
            </span>
            {aisle ? (
              <>
                <span className="text-text-muted" aria-hidden>
                  ›
                </span>
                <span className="whitespace-nowrap font-semibold text-text">Aisle {aisle.value}</span>
              </>
            ) : null}
          </div>
          {warehouse ? (
            <div className="whitespace-nowrap text-xs tabular-nums text-text-muted">
              {num(warehouse.rack_count)} racks · {num(warehouse.occupancy.empty)}/
              {num(warehouse.occupancy.capacity)} free · {pct(warehouse.occupancy.occupancy_pct)} occupied
            </div>
          ) : null}
        </div>
        {warehouses.length > 1 ? (
          <div className="flex items-center gap-0.5 rounded-full border border-border p-0.5">
            {warehouses.map((w) => (
              <button
                key={w.warehouse_code}
                type="button"
                onClick={() => onSelectWarehouse(w.warehouse_code)}
                aria-pressed={w.warehouse_code === activeWarehouseCode}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                  w.warehouse_code === activeWarehouseCode
                    ? "bg-primary text-[var(--color-primary-fg)]"
                    : "text-text-secondary hover:bg-surface-2",
                )}
              >
                {w.warehouse_code}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {divider}

      {/* tray colour key */}
      <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-0.5" aria-label="Tray colours">
        {(["empty", "occupied", "reserved", "blocked"] as const).map((st) => (
          <span key={st} className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <span className={cn("size-2.5 rounded-full", BAY_TRAY[st].className)} aria-hidden />
            {BAY_TRAY[st].label}
          </span>
        ))}
      </div>

      {divider}

      {/* how many racks */}
      <div className="flex shrink-0 items-center gap-2" title="Total racks in this warehouse">
        <span className="grid size-8 place-items-center rounded-[9px] bg-[var(--color-primary-light)] text-primary">
          <LayoutGrid className="size-4" aria-hidden />
        </span>
        <span className="whitespace-nowrap text-sm">
          <b className="text-base tabular-nums text-text">{num(warehouse?.rack_count ?? 0)}</b>{" "}
          <span className="text-text-muted">racks</span>
        </span>
      </div>

      {/* actions */}
      <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 xl:flex-nowrap">
        <button
          type="button"
          onClick={onTogglePending}
          aria-expanded={pendingOpen}
          title="Received lots waiting for a rack"
          className={cn(
            control,
            "ds-focus-ring flex items-center gap-1.5 px-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-2",
          )}
        >
          <Box className="size-4 text-primary" aria-hidden />
          <span className="min-w-3 tabular-nums">{pendingLoading ? "…" : pending.length}</span>
          {pendingOpen ? (
            <ChevronUp className="size-3.5 text-text-muted" />
          ) : (
            <ChevronDown className="size-3.5 text-text-muted" />
          )}
        </button>

        <div className="relative w-full min-w-[150px] sm:w-auto sm:max-w-72 sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onFind();
            }}
            placeholder="K-S4-R2-T05 or a model no"
            aria-label="Find a location or model"
            className={cn(
              control,
              "w-full pl-9 pr-3 text-sm outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)]",
            )}
          />
        </div>

        <Button
          size="sm"
          loading={findLoading}
          onClick={onFind}
          className="h-9 rounded-[10px] bg-[linear-gradient(135deg,var(--color-primary),color-mix(in_srgb,var(--color-primary)_65%,#062a2a))] px-4"
        >
          Find
        </Button>
        <Button variant="secondary" size="sm" loading={locateLoading} onClick={onLocate} className="h-9 rounded-[10px] px-3">
          <LocateFixed className="size-4" />
          {locateLabel}
        </Button>
        <button
          type="button"
          onClick={onRefresh}
          title="Refresh from the database"
          aria-label="Refresh"
          className={cn(
            control,
            "ds-focus-ring grid w-9 place-items-center text-text-secondary transition-colors hover:bg-surface-2 hover:text-text",
          )}
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
        </button>
        {trailing}
      </div>
    </div>
  );
}
