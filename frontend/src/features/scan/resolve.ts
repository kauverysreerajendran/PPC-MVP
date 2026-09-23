import { api } from "@/lib/api/client";
import type { Page, SapOutward } from "@/features/masterdata/types";
import { rackLocatorApi } from "@/features/rack-locator/api";
import type { ResolveResult } from "@/features/rack-locator/types";
import { sapApi } from "@/features/sap/api";
import type { SapInwardRecord } from "@/features/sap/types";
import type { ScanKind } from "./detect";

/**
 * Turns a scanned value into the SAP lines it names, composed client-side
 * from the services that already expose each piece (no aggregator):
 *
 * - Box UID / SAP ref → masterdata's outward line
 * - PO / DC → every outward line (masterdata) and SAP feed record carrying
 *   exactly that number — the feed covers lines not dispatched yet, masterdata
 *   the shortage back-orders the feed never sees
 * - location → the rack tray, and the line whose pieces are in it
 * - model / lot → the lines with trays in the racks (rack service) plus those
 *   carrying it (masterdata / feed)
 * - anything else → a plain search of masterdata and the feed
 *
 * A source that can't be reached is reported in `degraded`; what the others
 * returned is still shown. Only when every source failed does it throw.
 */

export type ScanService = "masterdata" | "sap" | "rack";

export const SCAN_SERVICE_LABEL: Record<ScanService, string> = {
  masterdata: "Masterdata",
  sap: "SAP feed",
  rack: "Rack",
};

/** One SAP line, as far as each service knows it. */
export interface ScanLine {
  ref: string;
  /** masterdata's outward line — null when the line was never dispatched */
  outward: SapOutward | null;
  /** the SAP feed record — null for a masterdata-only back-order */
  feed: SapInwardRecord | null;
}

export type ScannedSlot = NonNullable<ResolveResult["slot"]>;

export interface ScanResolution {
  kind: ScanKind;
  value: string;
  lines: ScanLine[];
  /** the tray a location scan resolved to */
  slot: ScannedSlot | null;
  degraded: ScanService[];
}

/** Lines a PO / DC / model search may return before the list is cut. */
const MAX_LINES = 50;

const outwards = (query: Record<string, string | number | boolean | undefined>) =>
  api
    .get<Page<SapOutward>>("/masterdata/sap-outwards", {
      query: { status: "active", page_size: 200, with_total: false, ...query },
    })
    .then((p) => p.items);

const feed = (query: { search?: string; refs?: string }) =>
  sapApi.listRecords({ page_size: 200, ...query }).then((p) => p.items);

const same = (a: string | null | undefined, b: string) => (a ?? "").toUpperCase() === b;

/** The value of a settled call, or `fallback` — noting the service that failed. */
function take<T>(
  r: PromiseSettledResult<T> | undefined,
  service: ScanService,
  failed: Set<ScanService>,
  fallback: T,
): T {
  if (!r) return fallback;
  if (r.status === "fulfilled") return r.value;
  failed.add(service);
  return fallback;
}

/** Joins masterdata lines and feed records by reference, in a stable order. */
function merge(out: SapOutward[], rec: SapInwardRecord[]): ScanLine[] {
  const byRef = new Map<string, ScanLine>();
  for (const o of out) byRef.set(o.sap_reference_id, { ref: o.sap_reference_id, outward: o, feed: null });
  for (const f of rec) {
    const hit = byRef.get(f.sap_reference_id);
    if (hit) hit.feed = f;
    else byRef.set(f.sap_reference_id, { ref: f.sap_reference_id, outward: null, feed: f });
  }
  return [...byRef.values()]
    .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }))
    .slice(0, MAX_LINES);
}

/** Two already-merged lists as one, without repeating a reference. */
function combine(a: ScanLine[], b: ScanLine[]): ScanLine[] {
  const seen = new Set(a.map((l) => l.ref));
  return [...a, ...b.filter((l) => !seen.has(l.ref))]
    .sort((x, y) => x.ref.localeCompare(y.ref, undefined, { numeric: true }))
    .slice(0, MAX_LINES);
}

/** Completes a set of references with both services' view of each. */
async function linesFor(
  refs: string[],
  failed: Set<ScanService>,
  known: SapOutward[] = [],
): Promise<ScanLine[]> {
  const unique = [...new Set(refs)].slice(0, 200);
  if (!unique.length) return [];
  const missing = unique.filter((r) => !known.some((o) => o.sap_reference_id === r));
  const [o, f] = await Promise.allSettled([
    missing.length ? outwards({ refs: missing.join(",") }) : Promise.resolve([]),
    feed({ refs: unique.join(",") }),
  ]);
  const out = [...known, ...take(o, "masterdata", failed, [])];
  const rec = take(f, "sap", failed, []).filter((r) => unique.includes(r.sap_reference_id));
  return merge(out, rec);
}

export async function resolveScan(value: string, kind: ScanKind): Promise<ScanResolution> {
  const failed = new Set<ScanService>();
  let attempted: ScanService[] = [];
  let lines: ScanLine[] = [];
  let slot: ScannedSlot | null = null;

  switch (kind) {
    case "box_uid": {
      attempted = ["masterdata"];
      const [o] = await Promise.allSettled([outwards({ box_uid: value, page_size: 1 })]);
      const found = take(o, "masterdata", failed, []);
      lines = await linesFor(found.map((x) => x.sap_reference_id), failed, found);
      break;
    }
    case "sap_ref": {
      attempted = ["masterdata", "sap"];
      lines = await linesFor([value], failed);
      break;
    }
    case "po":
    case "dc": {
      attempted = ["masterdata", "sap"];
      const field = kind === "po" ? "po_no" : "dc_no";
      const [o, f] = await Promise.allSettled([outwards({ search: value }), feed({ search: value })]);
      lines = merge(
        take(o, "masterdata", failed, []).filter((x) => same(x[field], value)),
        take(f, "sap", failed, []).filter((x) => same(x[field], value)),
      );
      break;
    }
    case "location": {
      attempted = ["rack"];
      const [r] = await Promise.allSettled([rackLocatorApi.resolve({ q: value })]);
      const res = take(r, "rack", failed, null);
      slot = res?.matched ? res.slot : null;
      if (slot?.sap_reference_id) lines = await linesFor([slot.sap_reference_id], failed);
      break;
    }
    case "model":
    case "lot": {
      attempted = ["rack", "masterdata", "sap"];
      const field = kind === "model" ? "model_no" : "lot_no";
      const [r, o, f] = await Promise.allSettled([
        rackLocatorApi.find({ q: value }),
        outwards({ search: value }),
        feed({ search: value }),
      ]);
      const placedRefs = (take(r, "rack", failed, null)?.placements ?? [])
        .filter((p) => (kind === "model" ? same(p.occupied_by_model, value) : same(p.lot_no, value)))
        .map((p) => p.sap_reference_id)
        .filter((x): x is string => !!x);
      const out = take(o, "masterdata", failed, []).filter((x) => same(x[field], value));
      const rec = take(f, "sap", failed, []).filter((x) => same(x[field], value));
      const extra = placedRefs.filter(
        (ref) => !out.some((x) => x.sap_reference_id === ref) && !rec.some((x) => x.sap_reference_id === ref),
      );
      lines = combine(merge(out, rec), await linesFor(extra, failed));
      break;
    }
    case "search": {
      attempted = ["masterdata", "sap"];
      const [o, f] = await Promise.allSettled([
        outwards({ search: value, page_size: 25 }),
        feed({ search: value }),
      ]);
      lines = merge(take(o, "masterdata", failed, []), take(f, "sap", failed, []).slice(0, 25));
      break;
    }
  }

  if (attempted.length && attempted.every((s) => failed.has(s))) {
    throw new Error(
      `${attempted.map((s) => SCAN_SERVICE_LABEL[s]).join(" and ")} could not be reached`,
    );
  }
  return { kind, value, lines, slot, degraded: [...failed] };
}
