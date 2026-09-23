"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Page } from "@/features/masterdata/types";
import type { SapInwardScan, SapInwardScanBody, SapOutward } from "@/features/masterdata/types";
import { sapInwardApi, type InwardLinesParams } from "./api";
import type { InwardDocument } from "./documents";
import { transactionalQueryOptions, usePollingInterval } from "@/lib/polling";

/** Every scan recorded against one outward line (detail view). */
export function useInwardScans(outwardId: string | null) {
  return useQuery<SapInwardScan[]>({
    queryKey: ["masterdata", "sap-inward", "scans", outwardId],
    queryFn: () => sapInwardApi.scans(outwardId as string),
    enabled: !!outwardId,
    staleTime: 2_000,
  });
}

/**
 * The receiving worklist. `stage: "pending"` is every dispatched line not yet
 * in a rack (with `started: true`, only those whose placement is under way);
 * without `stage` (or with `stage: "received"`) rows appear only once their
 * received pieces have been placed in a rack.
 */
export function useInwardLines(params: InwardLinesParams, { enabled = true } = {}) {
  const interval = usePollingInterval();
  return useQuery<Page<SapOutward>>({
    queryKey: ["masterdata", "sap-inward", "lines", params],
    queryFn: ({ signal }) => sapInwardApi.lines(params, { signal }),
    enabled,
    placeholderData: (prev) => prev,
    ...transactionalQueryOptions(interval),
  });
}

/**
 * The live state of the lines scanned at SAP Inward this session, polled like
 * the worklists so their receiving / placement status stays current. Keyed
 * under `sap-inward`, so every receiving mutation refreshes it too.
 */
export function useScannedInwardLines(refs: string[]) {
  const interval = usePollingInterval();
  const key = useMemo(() => [...new Set(refs)].sort(), [refs]);
  return useQuery<Page<SapOutward>>({
    queryKey: ["masterdata", "sap-inward", "scanned", key.join(",")],
    queryFn: ({ signal }) => sapInwardApi.byRefs(key, { signal }),
    enabled: key.length > 0,
    placeholderData: (prev) => prev,
    ...transactionalQueryOptions(interval),
  });
}

function useInvalidateOutwards() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["masterdata", "sap-outwards"] });
    qc.invalidateQueries({ queryKey: ["masterdata", "sap-inward"] });
    // A shortage raises a new outward line that SAP Outward shows beside the
    // SAP feed's own rows, so that list has to be re-read as well.
    qc.invalidateQueries({ queryKey: ["sap", "records"] });
    // scan / reset / verify all move statuses in the Status service
    qc.invalidateQueries({ queryKey: ["status"] });
  };
}

export function useInwardVerify() {
  const done = useInvalidateOutwards();
  return useMutation({
    mutationFn: ({ outwardId, documents }: { outwardId: string; documents: InwardDocument[] }) =>
      sapInwardApi.verify(outwardId, documents),
    onSuccess: done,
  });
}

/** Resolve a scanned Box UID to its outward line without recording anything. */
export function useInwardLookup() {
  return useMutation({
    mutationFn: (boxUid: string) => sapInwardApi.lookup(boxUid),
  });
}

/** Every active line on a scanned DC / PO — the document form of a scan. */
export function useInwardDocumentLookup() {
  return useMutation({
    mutationFn: ({ field, value }: { field: "dc_no" | "po_no"; value: string }) =>
      sapInwardApi.lookupDocument(field, value),
  });
}

export function useInwardScan() {
  const done = useInvalidateOutwards();
  return useMutation({
    mutationFn: (body: SapInwardScanBody) => sapInwardApi.scan(body),
    onSuccess: done,
  });
}

export function useInwardClose() {
  const done = useInvalidateOutwards();
  return useMutation({
    mutationFn: (outwardId: string) => sapInwardApi.close(outwardId),
    onSuccess: done,
  });
}

export function useInwardReset() {
  const done = useInvalidateOutwards();
  return useMutation({
    mutationFn: (outwardId: string) => sapInwardApi.reset(outwardId),
    onSuccess: done,
  });
}
