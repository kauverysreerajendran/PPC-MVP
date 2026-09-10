"use client";

import { useEffect, useMemo, useState } from "react";
import { LocateFixed, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useLocate, useRackDetail, useResolveLocation, useTopology } from "../hooks";
import type {
  LocateResult,
  RackSummary,
  Recommendation,
  SelectedLocation,
} from "../types";
import { AisleMap } from "./AisleMap";
import { EmptyLocationRecommendation } from "./EmptyLocationRecommendation";
import { LocationBreadcrumb, type LocationCrumb } from "./LocationBreadcrumb";
import { LocationSummary } from "./LocationSummary";
import { RackCard } from "./RackCard";
import { RackDetailView } from "./RackDetail";
import { RackOverview } from "./RackOverview";
import { num, pct } from "./trayStyles";

/**
 * Rack Locator.
 *
 * Drill-down: warehouse -> aisle -> rack -> shelf -> row -> tray. Every number,
 * every shelf and every ranked suggestion comes from the Rack service, which
 * derives them from the `rack_master` topology. This component chooses what to
 * show, never what is there.
 */
export function RackLocatorView() {
  const [warehouse, setWarehouse] = useState<string>("");
  const [aisle, setAisle] = useState<string>("");
  const [rackCode, setRackCode] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const [locateResult, setLocateResult] = useState<LocateResult | null>(null);
  const [query, setQuery] = useState("");

  const toast = useToast();
  const topology = useTopology();
  const locate = useLocate();
  const resolve = useResolveLocation();

  const warehouses = useMemo(
    () => topology.data?.warehouses ?? [],
    [topology.data],
  );

  // Follow the backend: whatever it returns first is the default selection, and
  // a selection that no longer exists (rack retired, aisle renamed) falls back.
  useEffect(() => {
    if (warehouses.length === 0) return;
    const current = warehouses.find((w) => w.warehouse_code === warehouse);
    const next = current ?? warehouses[0]!;
    if (next.warehouse_code !== warehouse) setWarehouse(next.warehouse_code);
    if (!next.aisles.some((a) => a.aisle_code === aisle)) {
      setAisle(next.aisles[0]?.aisle_code ?? "");
    }
  }, [warehouses, warehouse, aisle]);

  const activeWarehouse = warehouses.find((w) => w.warehouse_code === warehouse);
  const activeAisle = activeWarehouse?.aisles.find((a) => a.aisle_code === aisle);
  const racks = useMemo(
    () => [...(activeAisle?.racks ?? [])].sort((a, b) => a.position - b.position),
    [activeAisle],
  );

  // a rack that vanished from the master must not keep the detail pane open
  useEffect(() => {
    if (rackCode && racks.length > 0 && !racks.some((r) => r.rack_code === rackCode)) {
      setRackCode(null);
    }
  }, [racks, rackCode]);

  const detail = useRackDetail(
    rackCode && warehouse && aisle
      ? { warehouse_code: warehouse, aisle_code: aisle, rack_code: rackCode }
      : null,
  );

  function openRack(rack: RackSummary) {
    setWarehouse(rack.warehouse_code);
    setAisle(rack.aisle_code);
    setRackCode(rack.rack_code);
  }

  function takeRecommendation(rec: Recommendation) {
    setWarehouse(rec.warehouse_code);
    setAisle(rec.aisle_code);
    setRackCode(rec.rack_code);
    setSelected({
      warehouse_code: rec.warehouse_code,
      aisle_code: rec.aisle_code,
      rack_code: rec.rack_code,
      shelf_no: rec.shelf_no,
      row_no: rec.row_no,
      tray_no: rec.tray_no,
      code: rec.code,
      id: rec.id,
      state: "empty",
    });
  }

  async function runLocate() {
    if (!warehouse) return;
    try {
      const result = await locate.mutateAsync({
        warehouse_code: warehouse,
        ...(aisle ? { aisle_code: aisle } : {}),
        ...(rackCode ? { rack_code: rackCode } : {}),
        limit: 6,
      });
      setLocateResult(result);
      const best = result.recommendations[0];
      if (best) takeRecommendation(best);
      else toast("info", "No free trays in this selection");
    } catch (err) {
      toast("error", err instanceof ApiError ? err.displayMessage : "Locate failed");
    }
  }

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    try {
      const result = await resolve.mutateAsync({ q });
      if (!result.matched || !result.slot) {
        toast("info", `Nothing found for "${q}"`);
        return;
      }
      const slot = result.slot;
      setWarehouse(slot.warehouse_code);
      setAisle(slot.aisle_code);
      setRackCode(slot.rack_code);
      setSelected({
        warehouse_code: slot.warehouse_code,
        aisle_code: slot.aisle_code,
        rack_code: slot.rack_code,
        shelf_no: slot.shelf_no,
        row_no: slot.row_no,
        tray_no: slot.tray_no,
        code: slot.code,
        id: slot.id,
        state: slot.slot_state,
      });
    } catch (err) {
      toast("error", err instanceof ApiError ? err.displayMessage : "Search failed");
    }
  }

  const crumbs: LocationCrumb[] = [];
  if (activeWarehouse) {
    crumbs.push({
      kind: "Warehouse",
      value: activeWarehouse.warehouse_code,
      onClick: () => {
        setRackCode(null);
        setSelected(null);
      },
    });
  }
  if (activeAisle) {
    crumbs.push({
      kind: "Aisle",
      value: activeAisle.aisle_code,
      onClick: () => {
        setRackCode(null);
        setSelected(null);
      },
    });
  }
  if (rackCode) {
    crumbs.push({ kind: "Rack", value: rackCode, onClick: () => setSelected(null) });
  }
  if (selected) {
    crumbs.push({ kind: "Shelf", value: `S${selected.shelf_no}` });
    crumbs.push({ kind: "Row", value: `R${selected.row_no}` });
    crumbs.push({
      kind: "Tray",
      value: String(selected.tray_no).padStart(2, "0"),
    });
  }

  if (topology.isLoading && !topology.data) return <PageSkeleton />;
  if (topology.isError) {
    return (
      <ErrorState
        title="Unable to load the warehouse structure"
        onRetry={() => void topology.refetch()}
      />
    );
  }

  // recommendations belonging to the rack currently drawn, for in-rack markers
  const rackRecommendations =
    locateResult?.recommendations.filter((r) => r.rack_code === rackCode) ?? [];

  return (
    <div>
      <PageHeader
        title="Rack Locator"
        description="Find and assign the nearest empty tray in real time."
        breadcrumbs={[{ label: "Warehouse" }, { label: "Rack Locator" }]}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void topology.refetch()}
              title="Refresh from the database"
            >
              <RefreshCw className={cn("size-3.5", topology.isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" loading={locate.isPending} onClick={runLocate}>
              <LocateFixed className="size-4" />
              Locate Me
            </Button>
          </>
        }
      />

      {/* filters — options come from the topology, never a hardcoded list */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Warehouse">
          <select
            value={warehouse}
            onChange={(e) => {
              setWarehouse(e.target.value);
              setAisle("");
              setRackCode(null);
              setSelected(null);
            }}
            className={SELECT_CLASS}
          >
            {warehouses.map((w) => (
              <option key={w.warehouse_code} value={w.warehouse_code}>
                {w.warehouse_name ?? w.warehouse_code}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Aisle">
          <select
            value={aisle}
            onChange={(e) => {
              setAisle(e.target.value);
              setRackCode(null);
              setSelected(null);
            }}
            className={SELECT_CLASS}
          >
            {(activeWarehouse?.aisles ?? []).map((a) => (
              <option key={a.aisle_code} value={a.aisle_code}>
                {a.aisle_name ?? a.aisle_code}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Rack">
          <select
            value={rackCode ?? ""}
            onChange={(e) => {
              setRackCode(e.target.value || null);
              setSelected(null);
            }}
            className={SELECT_CLASS}
          >
            <option value="">All racks (aisle map)</option>
            {racks.map((r) => (
              <option key={r.id} value={r.rack_code}>
                {r.rack_code} — {r.shelf_count}×{r.row_count}×{r.tray_count}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Find a location or model" className="min-w-[220px] flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
              placeholder="K-S4-R2-T05 or a model no."
              aria-label="Find a location or model"
              className="h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface pl-8 pr-3 text-sm outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)]"
            />
          </div>
        </Field>

        <Button variant="secondary" size="md" loading={resolve.isPending} onClick={runSearch}>
          Find
        </Button>
      </div>

      {crumbs.length > 0 ? <LocationBreadcrumb crumbs={crumbs} className="mb-3" /> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          {!rackCode ? (
            activeAisle ? (
              <AisleMap aisle={activeAisle} onOpen={openRack} />
            ) : (
              <RackOverview topology={topology.data!} onOpen={openRack} />
            )
          ) : (
            <div className="grid gap-3 lg:grid-cols-[184px_minmax(0,1fr)]">
              {/* the aisle stays visible while you work inside one rack */}
              <aside className="hidden overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface lg:block">
                <header className="border-b border-border px-3 py-2">
                  <h3 className="text-xs font-semibold">Racks in Aisle {aisle}</h3>
                  <p className="mt-0.5 text-[10px] tabular-nums text-text-muted">
                    {activeAisle ? pct(activeAisle.occupancy.availability_pct) : "—"} available ·{" "}
                    {activeAisle ? num(activeAisle.occupancy.empty) : 0} trays
                  </p>
                </header>
                <div className="max-h-[560px] overflow-y-auto py-1">
                  {racks.map((rack) => (
                    <RackCard
                      key={rack.id}
                      rack={rack}
                      compact
                      active={rack.rack_code === rackCode}
                      onOpen={openRack}
                    />
                  ))}
                </div>
              </aside>

              {detail.isError ? (
                <ErrorState
                  title={`Unable to load rack ${rackCode}`}
                  onRetry={() => void detail.refetch()}
                />
              ) : detail.data ? (
                <RackDetailView
                  detail={detail.data}
                  selected={selected}
                  recommendations={rackRecommendations}
                  onSelect={setSelected}
                />
              ) : (
                <PageSkeleton />
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <LocationSummary selected={selected} onCleared={() => setSelected(null)} />
          <EmptyLocationRecommendation
            result={locateResult}
            selectedCode={selected?.code}
            loading={locate.isPending}
            onSelect={takeRecommendation}
          />
        </aside>
      </div>
    </div>
  );
}

const SELECT_CLASS =
  "h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)]";

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}
