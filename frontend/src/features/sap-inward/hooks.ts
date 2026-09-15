"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Page } from "@/features/masterdata/types";
import type { SapInwardScan, SapInwardScanBody, SapOutward } from "@/features/masterdata/types";
import { sapInwardApi } from "./api";
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

/** The receiving worklist — rows appear only once a box has been scanned. */
export function useInwardLines(params: {
  page?: number;
  page_size?: number;
  search?: string;
  inward_status?: string;
}) {
  const interval = usePollingInterval();
  return useQuery<Page<SapOutward>>({
    queryKey: ["masterdata", "sap-inward", "lines", params],
    queryFn: ({ signal }) => sapInwardApi.lines(params, { signal }),
    placeholderData: (prev) => prev,
    ...transactionalQueryOptions(interval),
  });
}

function useInvalidateOutwards() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["masterdata", "sap-outwards"] });
    qc.invalidateQueries({ queryKey: ["masterdata", "sap-inward"] });
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
