"use client";

import { create } from "zustand";
import type { SapOutward } from "@/features/masterdata/types";

/**
 * SAP Inward is a scanning station: its Main Table lists only the lines whose
 * Box UID was scanned here this session (plus, see below, placement already
 * under way). Dispatching on SAP Outward makes a line *scannable*, not listed.
 *
 * When true, lines whose rack placement was started and not finished
 * (IN_PROGRESS / DRAFT / PARTIALLY_PLACED) are listed without a scan, under
 * their own heading — so a saved draft or another shift's half-placed line is
 * never unreachable. Set false for strictly nothing-without-a-scan.
 */
export const SHOW_STARTED_WITHOUT_SCAN = true;

/** One line scanned at SAP Inward: the row as last seen, for instant display. */
export interface ScannedLine {
  id: string;
  ref: string;
  line: SapOutward;
}

interface ScannedState {
  /** newest scan first */
  lines: ScannedLine[];
  /** Add a scanned line (or bring an already scanned one back to the top). */
  add: (line: SapOutward) => void;
  /** Refresh the snapshot of a line already in the set; never adds one. */
  update: (line: SapOutward) => void;
  remove: (ids: string[]) => void;
  clear: () => void;
}

/**
 * The scanned set lives in memory only: it survives polling, tab switches and
 * a trip to the Rack Locator and back, and is gone on a browser reload.
 * Nothing clears it automatically except a line becoming fully placed.
 */
export const useScannedInward = create<ScannedState>((set) => ({
  lines: [],
  add: (line) =>
    set((s) => ({
      lines: [
        { id: line.id, ref: line.sap_reference_id, line },
        ...s.lines.filter((x) => x.id !== line.id),
      ],
    })),
  update: (line) =>
    set((s) =>
      s.lines.some((x) => x.id === line.id)
        ? { lines: s.lines.map((x) => (x.id === line.id ? { ...x, line } : x)) }
        : s,
    ),
  remove: (ids) =>
    set((s) => {
      const drop = new Set(ids);
      return { lines: s.lines.filter((x) => !drop.has(x.id)) };
    }),
  clear: () => set({ lines: [] }),
}));

/**
 * Why a scanned Box UID may not join the Main Table, or null when it may.
 * `rackCode` is the line's current status at the `rack` stage — null when the
 * Status service did not say (a line is then accepted, never wrongly refused).
 */
export function scanRefusal(
  boxUid: string,
  line: SapOutward | null,
  rackCode: string | null,
): string | null {
  if (!line || !line.box_uid || line.outward_status !== "DISPATCHED") {
    return `No dispatched line for '${boxUid}'`;
  }
  if (rackCode === "PLACED") return `${line.box_uid} is already placed`;
  return null;
}

/** The fields SAP Inward's search matches — the same ones the service searches. */
const SEARCH_FIELDS = [
  "box_uid",
  "dc_no",
  "po_no",
  "model_no",
  "batch_no",
  "lot_no",
  "sap_reference_id",
] as const satisfies readonly (keyof SapOutward)[];

/** Case-insensitive "contains" over the searchable fields of a line. */
export function matchesInwardSearch(line: SapOutward, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return SEARCH_FIELDS.some((f) => (line[f] ?? "").toLowerCase().includes(q));
}
