"use client";

import { create } from "zustand";
import type { ScanKind } from "./detect";

/** A scan made this session, for the Recent scans list. */
export interface RecentScan {
  value: string;
  kind: ScanKind;
  /** lines (or trays) it found — 0 is a miss */
  found: number;
  at: number;
}

interface ScanSession {
  /** the scan whose result is on screen */
  active: { value: string; kind: ScanKind } | null;
  /** the line opened in the result — a reference */
  selected: string | null;
  recent: RecentScan[];
  run: (value: string, kind: ScanKind) => void;
  select: (ref: string | null) => void;
  remember: (scan: RecentScan) => void;
  reset: () => void;
}

const MAX_RECENT = 8;

/**
 * In memory only: the current result and the recent list survive a trip to
 * another screen and back (e.g. View in Rack Locator), not a reload.
 */
export const useScanSession = create<ScanSession>((set) => ({
  active: null,
  selected: null,
  recent: [],
  run: (value, kind) => set({ active: { value, kind }, selected: null }),
  select: (selected) => set({ selected }),
  remember: (scan) =>
    set((s) => ({
      recent: [
        scan,
        ...s.recent.filter((r) => !(r.value === scan.value && r.kind === scan.kind)),
      ].slice(0, MAX_RECENT),
    })),
  reset: () => set({ active: null, selected: null }),
}));
