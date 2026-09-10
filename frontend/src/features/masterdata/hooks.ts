"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { masterdataApi, outwardStatusMasterApi, type MdResource } from "./api";
import type { ListParams, OutwardStatusDef, Page } from "./types";

const keys = {
  all: (r: MdResource) => ["masterdata", r] as const,
  list: (r: MdResource, p: ListParams) => ["masterdata", r, "list", p] as const,
};

export function useMdList<T>(resource: MdResource, params: ListParams = {}) {
  return useQuery<Page<T>>({
    queryKey: keys.list(resource, params),
    queryFn: ({ signal }) => masterdataApi<T>(resource).list(params, { signal }),
    // Near-live: poll every 5s while the tab is open so DB-admin edits show up
    // without a manual refresh; also refetches on window focus (see providers).
    staleTime: 2_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });
}

/** The outward-status lookup table (code → label / dispatched flag). */
export function useOutwardStatusMaster() {
  return useQuery<OutwardStatusDef[]>({
    queryKey: ["masterdata", "outward-status-master"],
    queryFn: ({ signal }) => outwardStatusMasterApi({ signal }),
    staleTime: 60_000,
  });
}

export function useMdCreate<T>(resource: MdResource) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => masterdataApi<T>(resource).create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all(resource) }),
  });
}

export function useMdUpdate<T>(resource: MdResource) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      masterdataApi<T>(resource).update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all(resource) }),
  });
}

export function useMdDelete(resource: MdResource) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => masterdataApi(resource).remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all(resource) }),
  });
}
