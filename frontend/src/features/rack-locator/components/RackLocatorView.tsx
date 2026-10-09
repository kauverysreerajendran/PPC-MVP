"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { WaveBanner } from "@/components/ui/WaveBanner";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import {
  rackLocatorKeys,
  useLocate,
  usePlaceReceived,
  useRackDetail,
  useRefreshPlacedQty,
  useResolveLocation,
  useTopology,
} from "../hooks";
import { usePlacementTarget } from "../usePlacementTarget";
import { planPlacement, remainderChangedMessage, withTrayCodes } from "../placementPlan";
import { DEFAULT_TRAY_CAPACITY_QTY } from "../trayCapacity";
import {
  addTray,
  addTrays,
  fillsMessage,
  followInHand,
  maxTraysFor,
  removeTray,
} from "../traySelection";
import type {
  ChosenTray,
  LocateResult,
  PlaceResult,
  Placement,
  RackSummary,
  Recommendation,
  SelectedLocation,
} from "../types";
import type { OccupancyTone } from "./trayStyles";
import { EmptyLocationRecommendation } from "./EmptyLocationRecommendation";
import type { LocationCrumb } from "./LocationBreadcrumb";
import { LocationSummary } from "./LocationSummary";
import { ModelPlacements } from "./ModelPlacements";
import { BlockedMessage } from "./placement/BlockedMessage";
import { ConfirmBar } from "./placement/ConfirmBar";
import { LineIdentityRow } from "./placement/LineIdentityRow";
import { PlacedSummary } from "./placement/PlacedSummary";
import { TraysInHand } from "./placement/TraysInHand";
import {
  LocatorHeaderControls,
  LocatorHeaderInfo,
  LocatorOverviewBar,
  LocatorTitleRow,
} from "./OverviewHeaderCard";
import { PendingPlacementsPanel } from "./placement/PendingPlacementsStrip";
import { RackDetailView } from "./RackDetail";
import { AisleSummaryCard, LegendCard, RackSummaryCard } from "./RackSidePanels";
import { RackOverview } from "./RackOverview";
import { ViewModeToggle } from "./three/ViewModeToggle";
import { useLocatorViewMode } from "./three/sceneKit";

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function toChosen(loc: SelectedLocation): ChosenTray {
  return {
    id: loc.id as string,
    code: loc.code,
    warehouse_code: loc.warehouse_code,
    aisle_code: loc.aisle_code,
    rack_code: loc.rack_code,
    shelf_no: loc.shelf_no,
    row_no: loc.row_no,
    tray_no: loc.tray_no,
  };
}

/**
 * Rack Locator.
 *
 * Drill-down: warehouse -> aisle -> rack -> shelf -> row -> tray. Every number,
 * every shelf and every ranked suggestion comes from the Rack service, which
 * derives them from the `rack_master` topology. This component chooses what to
 * show, never what is there.
 *
 * `?place=<SAP outward line id>` (SAP Inward's "Place in rack") is a *mode* on
 * this same screen, not a different screen: the line being placed shows as
 * context above the locator, and stock gets its tray by clicking that tray in
 * the rack grid below. No modal is involved anywhere in choosing a location.
 *
 * Received stock travels in trays, not loose pieces: the operator says how many
 * trays they are holding, the backend ranks that many free trays, and those
 * trays blink in the grid until they are taken. One tray holds up to
 * `DEFAULT_TRAY_CAPACITY_QTY` of the line's *quantity* (not its front+back
 * piece count), so the last tray of a line is usually partial —
 * `trayCapacity.ts` owns that arithmetic, here and on the service.
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

  // ?place=<SAP outward line id> from SAP Inward's "Place in rack" button.
  const placeId = searchParams.get("place");
  const placement = usePlacementTarget(placeId);
  const placeReceived = usePlaceReceived();
  const refreshPlacedQty = useRefreshPlacedQty();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<ChosenTray[]>([]);
  // Why the last confirm did not go through, shown on the confirm bar. It
  // belongs to the selection it was raised for (`key`), so the next change to
  // the trays dismisses it without an effect.
  const [placeNotice, setPlaceNotice] = useState<{ key: string; message: string } | null>(null);
  const [checkingFresh, setCheckingFresh] = useState(false);
  // between a successful place and the racks being re-read: the grid is busy,
  // and the success state waits so it never sits over the pre-place picture
  const [settling, setSettling] = useState(false);
  const [placeResult, setPlaceResult] = useState<PlaceResult | null>(null);
  // how many trays the operator says they have in hand — only the seed for how
  // many free trays the backend is asked to rank and blink, never a cap on
  // clicking. `null` = not touched yet, so the computed "trays needed" stands.
  const [traysInHand, setTraysInHand] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Recommendation[]>([]);
  const [freeTrays, setFreeTrays] = useState<number | null>(null);
  const lastSuggestKey = useRef<string | null>(null);

  /**
   * Drop everything the operator was working with: the selected tray, the
   * chosen trays, the blinking suggestions and any Suggest-a-tray markers.
   * Used after a place goes through and when the line changes, so no tray
   * from a finished (or abandoned) placement stays highlighted.
   */
  function clearWorkingSelection() {
    setSelected(null);
    setChosen([]);
    setSuggestions([]);
    setLocateResult(null);
    setTraysInHand(null);
    setPlaceNotice(null);
    lastSuggestKey.current = null;
  }

  // entering, switching or leaving placement mode starts from a clean slate
  const lastPlaceId = useRef(placeId);
  useEffect(() => {
    if (lastPlaceId.current === placeId) return;
    lastPlaceId.current = placeId;
    clearWorkingSelection();
    setPlaceResult(null);
  }, [placeId]);

  const { line, receivedQty, placedQty, remainingQty } = placement;

  // The tray arithmetic, in one place: qty still to place -> trays needed ->
  // how that qty falls into the trays actually in hand (25, 25, then the rest).
  const capacity = DEFAULT_TRAY_CAPACITY_QTY;
  // The one real cap: trays past what the remaining qty fills would take 0 qty,
  // which the service refuses. 232 qty at 25 per tray -> 10.
  const maxTrays = maxTraysFor(remainingQty, capacity);
  const inHand = followInHand(traysInHand ?? maxTrays, 0, maxTrays);
  // The request is built from this one plan: the qty split over the trays
  // actually chosen, trays with nothing to take dropped, and the reason
  // Confirm is disabled when the service would refuse it.
  const plan = planPlacement(chosen, remainingQty, capacity);
  /** qty the tray at `index` takes — the last one carries the remainder */
  const qtyForTray = (index: number) => plan.allocation[index] ?? 0;
  const selectionKey = `${chosen.map((c) => c.id).join(",")}|${inHand}`;
  const notice = placeNotice && placeNotice.key === selectionKey ? placeNotice.message : null;

  /** The stepper only re-seeds the suggestions; the trays already chosen stay. */
  function changeTraysInHand(next: number) {
    if (next > maxTrays) {
      toast("info", `${fillsMessage(remainingQty, maxTrays)} — that is the most this line needs`);
    }
    setTraysInHand(Math.max(1, Math.min(next, maxTrays)));
  }

  /**
   * Every change to the chosen trays goes through here: the qty is re-split
   * over whatever is chosen (via `plan`), and the stepper follows the operator
   * up when they have chosen more trays than it said.
   */
  function commitChosen(next: ChosenTray[]) {
    setChosen(next);
    if (next.length > inHand) setTraysInHand(followInHand(inHand, next.length, maxTrays));
  }

  const warehouses = useMemo(() => topology.data?.warehouses ?? [], [topology.data]);

  // Occupancy filter + pending-lots panel live here, not in the components that
  // draw them: the legend is in the header card while the dimming it drives is
  // in the aisle maps below, so one owner keeps them in step.
  const [occupancyFilter, setOccupancyFilter] = useState<OccupancyTone | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);

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

  const viewMode = useLocatorViewMode();
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

  // The selection as the rack reads *now*: the snapshot taken at click time
  // goes stale the moment the tray is filled, so look the tray up in the live
  // detail and fall back to the snapshot only while that is loading.
  const liveSelected = useMemo<SelectedLocation | null>(() => {
    if (!selected) return null;
    const data = detail.data;
    if (!data || data.rack_code !== selected.rack_code) return selected;
    for (const shelf of data.shelves) {
      for (const row of shelf.rows) {
        const tray = row.trays.find((t) => t.code === selected.code);
        if (tray) {
          return {
            ...selected,
            id: tray.id,
            state: tray.state,
            occupied_by_model: tray.occupied_by_model,
            qty: tray.qty,
            lot_no: tray.lot_no,
            sap_reference_id: tray.sap_reference_id,
          };
        }
      }
    }
    return selected;
  }, [selected, detail.data]);

  const activeRowCount =
    detail.data?.row_count ?? racks.find((r) => r.rack_code === rackCode)?.row_count;

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
      // a suggestion only ever *navigates* — the operator still clicks the tray
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

  /**
   * Placement suggestions: ask the backend for exactly as many free trays as
   * the operator has in hand, and blink them. Runs on entering placement mode
   * and whenever that number (or the warehouse) changes — the key guards
   * against the mutation re-triggering itself.
   */
  const suggestKey =
    placement.active && warehouse && remainingQty > 0 && !placeResult
      ? `${warehouse}|${inHand}`
      : null;

  useEffect(() => {
    if (!suggestKey || lastSuggestKey.current === suggestKey) return;
    lastSuggestKey.current = suggestKey;
    const [wh, limit] = suggestKey.split("|");
    const want = Number(limit);
    void (async () => {
      try {
        // Ask for more than we need and keep the ones in the best-ranked rack:
        // the operator walks to one rack, so every blinking tray should be in
        // the rack they are standing at. Anything left over follows in rank
        // order, which only matters when that rack cannot hold them all.
        const result = await locate.mutateAsync({
          warehouse_code: wh as string,
          limit: Math.min(50, Math.max(want * 5, 10)),
        });
        const best = result.recommendations[0]?.rack_code;
        const sameRack = result.recommendations.filter((r) => r.rack_code === best);
        const rest = result.recommendations.filter((r) => r.rack_code !== best);
        setSuggestions([...sameRack, ...rest].slice(0, want));
        setFreeTrays(result.total_empty);
      } catch (err) {
        toast("error", err instanceof ApiError ? err.displayMessage : "Could not suggest trays");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestKey]);

  // show the suggestions where they are: open the rack holding the best one,
  // unless the operator is already looking at a rack of their own choosing
  useEffect(() => {
    const best = suggestions[0];
    if (!placement.active || !best || rackCode) return;
    setWarehouse(best.warehouse_code);
    setAisle(best.aisle_code);
    setRackCode(best.rack_code);
  }, [suggestions, placement.active, rackCode]);

  /** Take the suggested trays in rank order, up to what the qty fills. */
  function acceptAllSuggestions() {
    const offered = suggestions.map((r) => ({
        id: r.id,
        code: r.code,
        warehouse_code: r.warehouse_code,
        aisle_code: r.aisle_code,
        rack_code: r.rack_code,
        shelf_no: r.shelf_no,
        row_no: r.row_no,
        tray_no: r.tray_no,
      }));
    const result = addTrays(chosen, offered, maxTrays);
    if (result.taken === 0) return;
    commitChosen(result.chosen);
    const first = result.chosen[chosen.length]!;
    setWarehouse(first.warehouse_code);
    setAisle(first.aisle_code);
    setRackCode(first.rack_code);
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

  /**
   * A click on a tray in the rack grid. Outside placement mode it only moves
   * the selection, as it always has; in placement mode an empty / reserved tray
   * is also taken as the location for the next tray, and clicking a tray that
   * is already chosen gives it back. Occupied and blocked trays are disabled in
   * placement mode (`pickerMode`), so they never get here.
   */
  function selectTray(loc: SelectedLocation) {
    const isChosen = placement.active && !placeResult && chosen.some((c) => c.code === loc.code);
    if (isChosen) {
      commitChosen(removeTray(chosen, loc.code));
      setSelected(null);
      return;
    }
    setSelected(loc);
    if (!placement.active || placeResult) return;
    if (!loc.id || (loc.state !== "empty" && loc.state !== "reserved")) return;
    // at the cap the new tray takes the last one's place — a changed mind, not an error
    const { chosen: next, replaced } = addTray(chosen, toChosen(loc), maxTrays);
    if (replaced) {
      toast("info", `${loc.code} replaces ${replaced.code} — ${fillsMessage(remainingQty, maxTrays)}`);
    }
    commitChosen(next);
  }

  /**
   * "All empty" on one column: take every free tray in it (tray 1 up), as far
   * as the qty goes — or, when all of them are already chosen, give
   * the whole column back, the same toggle a single tray click has.
   */
  function selectColumn(trays: SelectedLocation[]) {
    if (!placement.active || placeResult || trays.length === 0) return;
    if (trays.every((t) => chosen.some((c) => c.code === t.code))) {
      const codes = new Set(trays.map((t) => t.code));
      commitChosen(chosen.filter((c) => !codes.has(c.code)));
      setSelected(null);
      return;
    }
    const fills = fillsMessage(remainingQty, maxTrays);
    if (chosen.length >= maxTrays) {
      toast("info", `${fills} — remove one to choose a different location`);
      return;
    }
    const withId = trays.filter((t) => t.id);
    const result = addTrays(chosen, withId.map(toChosen), maxTrays);
    if (result.taken < result.offered) {
      toast("info", `Took ${result.taken} of ${result.offered} empty trays — ${fills}`);
    }
    commitChosen(result.chosen);
    const last = result.chosen[result.chosen.length - 1];
    setSelected(withId.find((t) => t.code === last?.code) ?? null);
  }

  async function confirmPlacement() {
    if (!line?.model_no || receivedQty == null) return;
    const key = selectionKey;
    if (plan.blockReason) {
      setPlaceNotice({ key, message: plan.blockReason });
      return;
    }
    const ref = line.sap_reference_id;
    const before = { placedQty, remainingQty };

    // The service recomputes what is already in racks at confirm time, so the
    // figures on screen must be that fresh too: re-read them, and if they moved
    // (an earlier partial placement, another tab) show the new split and let
    // the operator confirm again rather than send a stale one.
    setCheckingFresh(true);
    let freshPlaced: number;
    try {
      freshPlaced = await refreshPlacedQty(ref);
    } catch (err) {
      const message = err instanceof ApiError ? err.displayMessage : "Could not check the line";
      toast("error", message);
      setPlaceNotice({ key, message });
      return;
    } finally {
      setCheckingFresh(false);
    }
    const freshRemaining = Math.max(0, receivedQty - freshPlaced);
    if (freshRemaining !== remainingQty) {
      const changed = remainderChangedMessage(
        before,
        { placedQty: freshPlaced, remainingQty: freshRemaining },
        capacity,
      );
      const message = `${capitalise(changed)}. Check the trays and confirm again.`;
      toast("info", message);
      setPlaceNotice({ key, message });
      return;
    }

    try {
      const res = await placeReceived.mutateAsync({
        sap_reference_id: ref,
        model_no: line.model_no,
        lot_no: line.lot_no,
        received_pieces: line.received_pieces,
        // judged by quantity: Placed once the qty in racks reaches this
        received_qty: receivedQty,
        // one entry per tray that takes something, carrying its qty
        pieces: plan.pieces,
      });
      // Wait for the racks and the line's placed qty to be re-read (the
      // mutation already invalidated them) before calling it done, so the
      // success state never sits over the pre-place grid.
      setSettling(true);
      try {
        await queryClient.refetchQueries(
          { queryKey: rackLocatorKeys.all, type: "active" },
          { cancelRefetch: false },
        );
      } catch {
        // the grid's own polling catches up; the place itself went through
      } finally {
        setSettling(false);
      }
      clearWorkingSelection();
      setPlaceResult(res);
      toast("success", "Placed in rack");
    } catch (err) {
      let message =
        err instanceof ApiError
          ? withTrayCodes(err.displayMessage, chosen)
          : "Could not place the stock";
      if (err instanceof ApiError && err.status === 409) {
        // re-derive from the service's figures so the split on screen is the
        // one the next confirm will be judged against
        const after = await refreshPlacedQty(ref).catch(() => null);
        if (after != null && after !== before.placedQty) {
          const changed = remainderChangedMessage(
            before,
            { placedQty: after, remainingQty: Math.max(0, receivedQty - after) },
            capacity,
          );
          message = `${message} — ${changed}`;
        }
      }
      toast("error", message);
      setPlaceNotice({ key, message });
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
  const rackRecommendations: Recommendation[] =
    locateResult?.recommendations.filter((r) => r.rack_code === rackCode) ?? [];

  // in placement mode the markers are the trays already chosen in this session,
  // numbered by tray, so the grid shows what is spoken for
  const chosenMarkers: Recommendation[] = placement.active
    ? chosen
        .filter((c) => c.rack_code === rackCode)
        .map((c) => ({
          rank: chosen.findIndex((x) => x.code === c.code) + 1,
          score: 0,
          distance_m: 0,
          id: c.id,
          code: c.code,
          warehouse_code: c.warehouse_code,
          aisle_code: c.aisle_code,
          rack_code: c.rack_code,
          shelf_no: c.shelf_no,
          row_no: c.row_no,
          tray_no: c.tray_no,
          location_name: null,
          reason: "chosen for this line",
        }))
    : [];

  // Suggestions are not drawn in the grid — the operator picks every tray
  // themselves; "Accept all suggestions" is the one way to take them.
  const gridMarkers = placement.active
    ? [
        ...chosenMarkers,
        ...rackRecommendations.filter((r) => !chosen.some((c) => c.code === r.code)),
      ]
    : rackRecommendations;

  /** Placement mode's working state: the one compact card carries the line,
   * the tray arithmetic and the pickers, and the side column folds into it. */
  const placementCard =
    placement.active &&
    !placement.isLoading &&
    !placement.isError &&
    !!line &&
    !placeResult &&
    line.received_pieces > 0 &&
    receivedQty != null &&
    !!line.model_no;

  /** Find a tray / model / lot — the same field in and out of placement mode. */
  const searchField = (
    <div
      className={cn(
        "relative",
        placementCard ? "w-full min-w-[150px] sm:w-[220px]" : "w-[190px]",
      )}
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void runSearch();
        }}
        placeholder="K-S4-R2-T05 or a model no."
        aria-label="Find a location or model"
        className={cn(
          "w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface pl-8 pr-3 text-sm outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)]",
          "h-8",
        )}
      />
    </div>
  );

  /** The tray the operator last pointed at, as one value — and the qty it
   * takes when it is one of the trays chosen for this line. */
  function selectedValue(): string {
    if (!liveSelected) return "No tray selected";
    const index = chosen.findIndex((c) => c.code === liveSelected.code);
    if (index >= 0) return `${liveSelected.code} · ${qtyForTray(index)} qty`;
    if (liveSelected.qty != null) return `${liveSelected.code} · ${liveSelected.qty} qty`;
    return liveSelected.code;
  }

  /** The pickers of the placement card's control row: where to look. */
  function placementPickers() {
    return (
      <>
        <span aria-hidden className="hidden h-6 w-px bg-border xl:block" />
        <PickerSelect
          label="Warehouse"
          value={warehouse}
          onChange={(v) => {
            setWarehouse(v);
            setAisle("");
            setRackCode(null);
            setSelected(null);
            setLocateResult(null);
          }}
          options={warehouses.map((w) => ({
            value: w.warehouse_code,
            label: w.warehouse_name ?? w.warehouse_code,
          }))}
        />
        <PickerSelect
          label="Aisle"
          value={aisle}
          onChange={(v) => {
            setAisle(v);
            setRackCode(null);
            setSelected(null);
          }}
          options={(activeWarehouse?.aisles ?? []).map((a) => ({
            value: a.aisle_code,
            label: a.aisle_name ?? a.aisle_code,
          }))}
        />
        <PickerSelect
          label="Rack"
          value={rackCode ?? ""}
          onChange={(v) => {
            setRackCode(v || null);
            setSelected(null);
          }}
          options={[
            { value: "", label: "All racks" },
            ...racks.map((r) => ({ value: r.rack_code, label: r.rack_code })),
          ]}
        />
        {remainingQty > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            loading={locate.isPending}
            disabled={suggestions.length === 0 || chosen.length >= maxTrays || locate.isPending}
            onClick={acceptAllSuggestions}
          >
            <Sparkles className="size-3.5" />
            Accept all suggestions
          </Button>
        ) : null}
        {searchField}
        <Button
          variant="secondary"
          size="sm"
          loading={resolve.isPending}
          onClick={() => void runSearch()}
        >
          Find
        </Button>
        <Button size="sm" loading={locate.isPending} onClick={() => void runLocate()}>
          <LocateFixed className="size-3.5" />
          Suggest a tray
        </Button>
        <p className="flex min-w-0 items-center gap-1.5 text-xs">
          <MapPin className="size-3 shrink-0 text-primary" aria-hidden />
          <span className="text-text-muted">Selected</span>
          <span
            className={cn(
              "truncate tabular-nums",
              selected ? "font-medium text-text" : "text-text-secondary",
            )}
          >
            {selectedValue()}
          </span>
        </p>
      </>
    );
  }

  /** Nearest empty trays after "Suggest a tray" — a disclosure, only when
   * there is something in it. */
  function nearestEmpty() {
    const ranked = locateResult?.recommendations.length ?? 0;
    return ranked > 0 && locateResult ? (
      <details className="group min-w-0 text-xs">
        <summary className="ds-focus-ring flex cursor-pointer list-none items-center gap-1 rounded text-text-secondary hover:text-text">
          <ChevronRight className="size-3 transition-transform group-open:rotate-90" aria-hidden />
          Nearest empty: {ranked} ranked of {locateResult.total_empty.toLocaleString()} free
        </summary>
        <div className="mt-1.5 max-h-56 w-full overflow-y-auto sm:w-72">
          <EmptyLocationRecommendation
            bare
            result={locateResult}
            selectedCode={selected?.code}
            loading={locate.isPending}
            onSelect={takeRecommendation}
            onMore={() => void runLocate(24)}
          />
        </div>
      </details>
    ) : null;
  }

  /** The line context above the locator — one compact card, never a takeover
   * of the page. */
  function placementContext() {
    if (placement.isLoading) {
      return (
        <div className="mb-3 space-y-2 rounded-[var(--radius-lg)] border border-border bg-surface p-3 shadow-[var(--shadow-sm)]">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-full" />
        </div>
      );
    }
    if (placement.isError || !line) {
      return (
        <div className="mb-3">
          <ErrorState title="Unable to load this line" onRetry={() => placement.refetch()} />
        </div>
      );
    }
    if (placeResult) {
      return (
        <div className="mb-3">
          <PlacedSummary slots={placeResult.slots} />
        </div>
      );
    }
    if (line.received_pieces === 0) {
      return (
        <div className="mb-3">
          <BlockedMessage
            title="Nothing received on this line yet"
            description="Enter the accepted quantity on SAP Inward, then come back."
            cta={{ label: "Go to SAP Inward", href: "/sap-inward" }}
          />
        </div>
      );
    }
    if (receivedQty == null) {
      return (
        <div className="mb-3">
          <BlockedMessage
            title="This line has no accepted quantity"
            description="Trays are filled by quantity — enter it on SAP Inward, then come back."
            cta={{ label: "Go to SAP Inward", href: "/sap-inward" }}
          />
        </div>
      );
    }
    if (!line.model_no) {
      return (
        <div className="mb-3">
          <BlockedMessage
            title="This line has no model number"
            description="Fix it in Master Data before placing."
            cta={{ label: "Go to Master Data", href: "/master-data" }}
          />
        </div>
      );
    }

    return (
      <section
        aria-label="What you are placing"
        className="mb-3 divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] [&>*]:px-3 [&>*]:py-2.5"
      >
        <LineIdentityRow
          line={line}
          placedQty={placedQty}
          receivedQty={receivedQty}
          remainingQty={remainingQty}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {remainingQty === 0 ? (
            <p className="text-sm font-medium text-[var(--color-success)]">
              All {receivedQty.toLocaleString()} qty is already in racks.
            </p>
          ) : (
            <TraysInHand
              value={inHand}
              onChange={changeTraysInHand}
              max={maxTrays}
              remainingQty={remainingQty}
              capacity={capacity}
              freeTrays={freeTrays}
            />
          )}
          {placementPickers()}
        </div>
        {nearestEmpty()}
      </section>
    );
  }

  const rackOpen = !!rackCode && !!detail.data;
  // the overview (no rack open, not placing stock) has its own head rows
  const overview = !placement.active && !rackCode;
  const showAside = !placementCard || !!findQuery || rackOpen;

  const showConfirmBar =
    placement.active && !!line && !placeResult && !!line.model_no && remainingQty > 0;

  // The column the current selection sits in, as the service described it.
  const selectedColumn =
    selected && detail.data && selected.rack_code === detail.data.rack_code
      ? (detail.data.shelves
          .find((s) => s.shelf_no === selected.shelf_no)
          ?.rows.find((r) => r.row_no === selected.row_no) ?? null)
      : null;

  /**
   * The stepper's number: the trailing trays of `chosen` that all sit in the
   * selected column. Every tray still gets its own qty and its own entry in
   * the payload — the stepper just takes several of them in one go.
   */
  let runLength = 0;
  if (selected) {
    for (let i = chosen.length - 1; i >= 0; i -= 1) {
      const c = chosen[i]!;
      if (
        c.rack_code === selected.rack_code &&
        c.shelf_no === selected.shelf_no &&
        c.row_no === selected.row_no
      ) {
        runLength += 1;
      } else break;
    }
  }

  const runTop = runLength > 0 ? chosen[chosen.length - 1]!.tray_no : (selected?.tray_no ?? 0);

  /** free trays above the run, never one that is already spoken for */
  const freeAboveRun = selectedColumn
    ? selectedColumn.trays.filter(
        (t) =>
          t.id &&
          (t.state === "empty" || t.state === "reserved") &&
          t.tray_no > runTop &&
          !chosen.some((c) => c.code === t.code),
      )
    : [];

  const runMax = selectedColumn
    ? runLength + Math.max(0, Math.min(maxTrays - chosen.length, freeAboveRun.length))
    : 0;

  function setRunCount(next: number) {
    if (!selected || !selectedColumn) return;
    const target = Math.max(0, Math.min(next, runMax));
    if (target < runLength) {
      const drop = runLength - target;
      commitChosen(chosen.slice(0, chosen.length - drop));
      return;
    }
    const need = target - runLength;
    if (need <= 0) return;
    const additions = freeAboveRun.slice(0, need).map((t) => ({
      id: t.id as string,
      code: t.code,
      warehouse_code: selected.warehouse_code,
      aisle_code: selected.aisle_code,
      rack_code: selected.rack_code,
      shelf_no: selected.shelf_no,
      row_no: selected.row_no,
      tray_no: t.tray_no,
    }));
    if (additions.length > 0) commitChosen([...chosen, ...additions]);
  }

  const refreshButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void topology.refetch()}
      title="Refresh from the database"
      aria-label="Refresh"
    >
      <RefreshCw className={cn("size-3.5", topology.isFetching && "animate-spin")} />
    </Button>
  );
  const pendingPanel = (
    <div className="mb-4 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] [&>div]:border-t-0">
      <PendingPlacementsPanel />
    </div>
  );

  return (
    <div>
      {!placement.active ? (
        <LocatorTitleRow
          warehouseName={activeWarehouse?.warehouse_name ?? undefined}
          crumbs={crumbs}
          subtitle={
            rackCode
              ? "View and locate free trays across racks, shelves and columns"
              : "Find and locate free trays across racks, shelves and columns"
          }
          actions={
            <>
              {cameFromLink ? (
                <Button variant="secondary" size="sm" onClick={() => router.back()}>
                  <ArrowLeft className="size-3.5" />
                  Back
                </Button>
              ) : null}
              {/* the overview's refresh lives in its toolbar */}
              {rackCode ? refreshButton : null}
            </>
          }
        />
      ) : (
      <WaveBanner
        breadcrumb={
          placement.active
            ? [{ label: "SAP Inward" }, { label: "Place in rack" }]
            : [{ label: "Warehouse" }, { label: "Rack Locator" }]
        }
        title={placement.active ? "Place received stock" : "Rack Locator"}
        subtitle={
          placementCard ? (
            line?.box_uid ? (
              `Box ${line.box_uid}`
            ) : (
              "Pick the trays in the racks below."
            )
          ) : (
            // where you are (and, in overview, how full it is) — the banner
            // carries what used to be a header card of its own
            <LocatorHeaderInfo
              warehouse={activeWarehouse}
              warehouses={warehouses}
              activeWarehouseCode={warehouse}
              onSelectWarehouse={(code) => {
                setWarehouse(code);
                setAisle("");
                setRackCode(null);
                setSelected(null);
                setLocateResult(null);
              }}
              crumbs={crumbs}
              showOccupancy={!rackCode}
              filter={occupancyFilter}
              onToggleFilter={(tone) =>
                setOccupancyFilter((cur) => (cur === tone ? null : tone))
              }
            />
          )
        }
        actions={
          <>
            {placementCard ? null : (
              <LocatorHeaderControls
                searchField={searchField}
                onFind={() => void runSearch()}
                findLoading={resolve.isPending}
                onLocate={() => void runLocate()}
                locateLoading={locate.isPending}
                locateLabel={placement.active ? "Suggest a tray" : "Locate Me"}
                pendingOpen={pendingOpen}
                onTogglePending={() => setPendingOpen((v) => !v)}
              />
            )}
            {placement.active ? (
              <Button variant="secondary" size="sm" onClick={() => router.push("/sap-inward")}>
                <ArrowLeft className="size-3.5" />
                Back to SAP Inward
              </Button>
            ) : cameFromLink ? (
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
              aria-label="Refresh"
            >
              <RefreshCw className={cn("size-3.5", topology.isFetching && "animate-spin")} />
            </Button>
          </>
        }
      />
      )}

      {overview ? (
        <>
          <LocatorOverviewBar
            warehouse={activeWarehouse}
            warehouses={warehouses}
            activeWarehouseCode={warehouse}
            onSelectWarehouse={(code) => {
              setWarehouse(code);
              setAisle("");
              setRackCode(null);
              setSelected(null);
              setLocateResult(null);
            }}
            crumbs={crumbs}
            query={query}
            onQueryChange={setQuery}
            onFind={() => void runSearch()}
            findLoading={resolve.isPending}
            onLocate={() => void runLocate()}
            locateLoading={locate.isPending}
            locateLabel="Locate Me"
            pendingOpen={pendingOpen}
            onTogglePending={() => setPendingOpen((v) => !v)}
            onRefresh={() => void topology.refetch()}
            refreshing={topology.isFetching}
            trailing={<ViewModeToggle mode={viewMode} variant="tabs" compact className="shrink-0 p-0.5" />}
          />
          {pendingOpen ? pendingPanel : null}
        </>
      ) : null}

      {placement.active ? placementContext() : null}

      {/* received lots waiting for a rack — opened from the banner (placement
          mode) or from the overview toolbar */}
      {placement.active && !placementCard && pendingOpen ? pendingPanel : null}

      <div
        className={cn(
          "grid gap-4",
          showAside && "lg:grid-cols-[minmax(0,1fr)_360px]",
        )}
      >
        {/* centre stage */}
        <div
          className={cn("min-w-0", settling && "pointer-events-none opacity-60 transition-opacity")}
          aria-busy={settling || undefined}
        >
          {!rackCode ? (
            activeWarehouse ? (
              <RackOverview
                warehouse={activeWarehouse}
                showToggle={!overview}
                filter={occupancyFilter}
                onOpen={openRack}
              />
            ) : (
              <PageSkeleton />
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
              recommendations={gridMarkers}
              onSelect={selectTray}
              pickerMode={showConfirmBar}
              chosenCodes={showConfirmBar ? chosen.map((c) => c.code) : undefined}
              onSelectColumn={showConfirmBar ? selectColumn : undefined}
            />
          ) : (
            <PageSkeleton />
          )}
        </div>

        {/* beside the rack: what it holds, the colour key and the selection.
            In placement mode the selection lives in the card above, so only
            the rack's own cards and Find results stay here. */}
        {showAside ? (
          <aside className="space-y-4">
            {rackOpen && detail.data ? (
              <>
                <RackSummaryCard
                  detail={detail.data}
                  racks={racks}
                  onPickRack={(code) => {
                    setRackCode(code);
                    setSelected(null);
                  }}
                />
                <LegendCard />
              </>
            ) : null}
            {placementCard ? null : (
              <LocationSummary
                selected={liveSelected}
                rowCount={activeRowCount}
                onCleared={() => setSelected(null)}
              />
            )}
            {overview ? (
              <>
                <AisleSummaryCard
                  aisles={activeWarehouse?.aisles ?? []}
                  aisleCode={aisle}
                  onPickAisle={(code) => {
                    setAisle(code);
                    setRackCode(null);
                    setSelected(null);
                  }}
                />
                <EmptyLocationRecommendation
                  result={locateResult}
                  selectedCode={selected?.code}
                  loading={locate.isPending}
                  onSelect={takeRecommendation}
                  onMore={() => void runLocate(24)}
                  onLocate={() => void runLocate()}
                />
              </>
            ) : null}
            {findQuery ? (
              <ModelPlacements
                query={findQuery}
                selectedCode={selected?.code}
                onPick={takePlacement}
                onClose={() => setFindQuery(null)}
              />
            ) : null}
          </aside>
        ) : null}
      </div>

      {/* the Locate Me ranking, as a row of cards under the rack (the overview
          lists it in the right column instead) */}
      {placementCard || overview ? null : (
        <div className="mt-4">
          <EmptyLocationRecommendation
            layout="strip"
            result={locateResult}
            selectedCode={selected?.code}
            loading={locate.isPending}
            onSelect={takeRecommendation}
            onMore={() => void runLocate(24)}
            onLocate={() => void runLocate()}
          />
        </div>
      )}

      {showConfirmBar ? (
        <ConfirmBar
          chosen={chosen}
          qtyForTray={qtyForTray}
          onRemove={(i) => commitChosen(chosen.filter((_, idx) => idx !== i))}
          selection={
            selected && selectedColumn
              ? {
                  shelfNo: selected.shelf_no,
                  rowNo: selected.row_no,
                  occupied: selectedColumn.occupancy.occupied,
                  capacity: selectedColumn.occupancy.capacity,
                }
              : null
          }
          count={runLength}
          max={runMax}
          onCountChange={setRunCount}
          total={plan.total}
          sendCount={plan.pieces.length}
          blockReason={plan.blockReason}
          notice={notice}
          unneededCount={plan.unneeded.length}
          onDropUnneeded={() =>
            commitChosen(chosen.filter((c) => !plan.unneeded.some((u) => u.id === c.id)))
          }
          disabled={!!plan.blockReason}
          pending={placeReceived.isPending || checkingFresh || settling}
          onConfirm={() => void confirmPlacement()}
        />
      ) : null}
    </div>
  );
}

/** A compact labelled select for the placement card's picker row. */
function PickerSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={options.length === 0}
        className="h-8 max-w-[150px] rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)] disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
