"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, LocateFixed, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useToast } from "@/components/ui/Toast";
import { WaveBanner } from "@/components/ui/WaveBanner";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useLocate, useRackDetail, useResolveLocation, useTopology } from "../hooks";
import type {
  LocateResult,
  Placement,
  RackSummary,
  Recommendation,
  SelectedLocation,
} from "../types";
import { AisleMap } from "./AisleMap";
import { EmptyLocationRecommendation } from "./EmptyLocationRecommendation";
import { LocationBreadcrumb, type LocationCrumb } from "./LocationBreadcrumb";
import { LocationSummary } from "./LocationSummary";
import { ModelPlacements } from "./ModelPlacements";
import { PendingPlacementsStrip } from "./placement/PendingPlacementsStrip";
import { PlacementFlow } from "./placement/PlacementFlow";
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
  const [findQuery, setFindQuery] = useState<string | null>(null);

  const toast = useToast();
  const topology = useTopology();
  const locate = useLocate();
  const resolve = useResolveLocation();

  // Arrived here from a "Rack" button elsewhere (e.g. the SAP grids):
  // ?q=<model / lot / location> — jump straight to it and offer a Back button.
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q");
  const [cameFromLink, setCameFromLink] = useState(false);
  const didUrlSearch = useRef(false);

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

  const activeRowCount =
    detail.data?.row_count ??
    racks.find((r) => r.rack_code === rackCode)?.row_count;

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

  async function runLocate(limit = 6) {
    if (!warehouse) return;
    try {
      const result = await locate.mutateAsync({
        warehouse_code: warehouse,
        ...(aisle ? { aisle_code: aisle } : {}),
        ...(rackCode ? { rack_code: rackCode } : {}),
        limit,
      });
      setLocateResult(result);
      const best = result.recommendations[0];
      if (best) takeRecommendation(best);
      else toast("info", "No free trays in this selection");
    } catch (err) {
      toast("error", err instanceof ApiError ? err.displayMessage : "Locate failed");
    }
  }

  const CODE_RE = /^[A-Za-z0-9]+[-/ ]?s\d+[-/ ]?r\d+[-/ ]?t\d+$/i;

  async function runSearch(term?: string) {
    const q = (term ?? query).trim();
    if (!q) return;
    if (term && term !== query) setQuery(term);
    try {
      const result = await resolve.mutateAsync({ q });
      if (!result.matched || !result.slot) {
        toast("info", `Nothing found for "${q}"`);
        setFindQuery(null);
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
        occupied_by_model: slot.occupied_by_model,
        qty: slot.qty,
        lot_no: slot.lot_no,
        sap_reference_id: slot.sap_reference_id,
      });
      // a plain location code points at exactly one tray; a model / lot / SAP
      // reference can sit in many — show all of them.
      setFindQuery(CODE_RE.test(q) ? null : q);
    } catch (err) {
      toast("error", err instanceof ApiError ? err.displayMessage : "Search failed");
    }
  }

  function takePlacement(p: Placement) {
    setWarehouse(p.warehouse_code);
    setAisle(p.aisle_code);
    setRackCode(p.rack_code);
    setSelected({
      warehouse_code: p.warehouse_code,
      aisle_code: p.aisle_code,
      rack_code: p.rack_code,
      shelf_no: p.shelf_no,
      row_no: p.row_no,
      tray_no: p.tray_no,
      code: p.code,
      id: p.id,
      state: "occupied",
      occupied_by_model: p.occupied_by_model,
      qty: p.qty,
      lot_no: p.lot_no,
      sap_reference_id: p.sap_reference_id,
    });
  }

  // run the ?q= search once the topology is in, exactly once per mount
  useEffect(() => {
    if (didUrlSearch.current || !urlQuery || warehouses.length === 0) return;
    didUrlSearch.current = true;
    setCameFromLink(true);
    setQuery(urlQuery);
    void runSearch(urlQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery, warehouses.length]);

  // ?place=<SAP outward line id> from SAP Inward's "Place in rack" button:
  // rendered entirely by PlacementFlow (see the early return below) — the
  // normal locator layout underneath is untouched.
  const placeId = searchParams.get("place");

  function selectTray(loc: SelectedLocation) {
    setSelected(loc);
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

  // ?place=<id>: the dedicated three-step placement screen, nothing else.
  if (placeId) return <PlacementFlow placeId={placeId} />;

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
  const rackRecommendations: Recommendation[] =
    locateResult?.recommendations.filter((r) => r.rack_code === rackCode) ?? [];

  return (
    <div>
      <WaveBanner
        breadcrumb={[{ label: "Warehouse" }, { label: "Rack Locator" }]}
        title="Rack Locator"
        subtitle="Find and assign the nearest empty tray in real time."
        actions={
          <>
            {cameFromLink ? (
              <Button variant="secondary" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="size-3.5" />
                Back
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void topology.refetch()}
              title="Refresh from the database"
            >
              <RefreshCw
                className={cn("size-3.5", topology.isFetching && "animate-spin")}
              />
              Refresh
            </Button>
          </>
        }
      />

      <PendingPlacementsStrip />

      {/* filters — options come from the topology, never a hardcoded list */}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
        <Field label="Warehouse">
          <select
            value={warehouse}
            onChange={(e) => {
              setWarehouse(e.target.value);
              setAisle("");
              setRackCode(null);
              setSelected(null);
              setLocateResult(null);
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
              setLocateResult(null);
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

        <Field label="Find a location or model" className="min-w-[200px] flex-1">
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

        <Button
          variant="secondary"
          size="md"
          loading={resolve.isPending}
          onClick={() => void runSearch()}
        >
          Find
        </Button>

        <Button
          size="md"
          className="ml-auto"
          loading={locate.isPending}
          onClick={() => void runLocate()}
        >
          <LocateFixed className="size-4" />
          Locate Me
        </Button>
      </div>

      {crumbs.length > 0 ? <LocationBreadcrumb crumbs={crumbs} className="mb-3" /> : null}

      <div className="grid gap-4 lg:grid-cols-[164px_minmax(0,1fr)_290px]">
        {/* racks in the active aisle — always in view */}
        <aside className="self-start rounded-[var(--radius-lg)] border border-border bg-surface p-2 shadow-[var(--shadow-sm)] lg:sticky lg:top-4">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            Aisle {activeAisle?.aisle_code ?? "—"}
          </h2>
          <p className="mt-0.5 px-1 text-[10px] tabular-nums text-text-muted">
            {activeAisle ? pct(activeAisle.occupancy.availability_pct) : "—"} free ·{" "}
            {activeAisle ? num(activeAisle.occupancy.empty) : 0} trays
          </p>
          <div className="mt-1.5 max-h-[520px] space-y-px overflow-y-auto">
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

        {/* centre stage */}
        <div className="min-w-0">
          {!rackCode ? (
            activeAisle ? (
              <AisleMap
                aisle={activeAisle}
                activeRackCode={rackCode ?? undefined}
                onOpen={openRack}
              />
            ) : (
              <RackOverview topology={topology.data!} onOpen={openRack} />
            )
          ) : detail.isError ? (
            <ErrorState
              title={`Unable to load rack ${rackCode}`}
              onRetry={() => void detail.refetch()}
            />
          ) : detail.data ? (
            <RackDetailView
              detail={detail.data}
              selected={selected}
              recommendations={rackRecommendations}
              onSelect={selectTray}
            />
          ) : (
            <PageSkeleton />
          )}
        </div>

        {/* selection + recommendations */}
        <aside className="space-y-4">
          <LocationSummary
            selected={selected}
            rowCount={activeRowCount}
            onCleared={() => setSelected(null)}
          />
          {findQuery ? (
            <ModelPlacements
              query={findQuery}
              selectedCode={selected?.code}
              onPick={takePlacement}
              onClose={() => setFindQuery(null)}
            />
          ) : null}
          <EmptyLocationRecommendation
            result={locateResult}
            selectedCode={selected?.code}
            loading={locate.isPending}
            onSelect={takeRecommendation}
            onMore={() => void runLocate(24)}
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
