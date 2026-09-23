"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sapApi } from "./api";
import type { ListRecordsParams, RecordUpdate } from "./types";
import { transactionalQueryOptions, usePollingInterval } from "@/lib/polling";

const keys = {
  all: ["sap"] as const,
  records: (p: ListRecordsParams) => ["sap", "records", p] as const,
  enums: ["sap", "enums"] as const,
  syncRuns: ["sap", "sync-runs"] as const,
};

export function useSapRecords(params: ListRecordsParams = {}, opts: { enabled?: boolean } = {}) {
  const interval = usePollingInterval();
  return useQuery({
    queryKey: keys.records(params),
    queryFn: ({ signal }) => sapApi.listRecords(params, { signal }),
    placeholderData: (prev) => prev,
    ...transactionalQueryOptions(interval),
    // A lookup query (e.g. the back-orders' parents) asks for nothing until it
    // has references to ask about — without this it would fetch page 1 twice.
    ...(opts.enabled === undefined ? {} : { enabled: opts.enabled }),
  });
}

export function useSapEnums() {
  return useQuery({
    queryKey: keys.enums,
    queryFn: ({ signal }) => sapApi.enums({ signal }),
    staleTime: 5 * 60_000,
  });
}

export function useSyncRuns() {
  return useQuery({
    queryKey: keys.syncRuns,
    queryFn: ({ signal }) => sapApi.syncRuns({ signal }),
    staleTime: 15_000,
  });
}

export function useUpdateSapRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RecordUpdate }) =>
      sapApi.updateRecord(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useTriggerSapSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (count?: number) => sapApi.triggerSync(count),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
