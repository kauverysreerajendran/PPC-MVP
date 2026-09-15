"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { masterdataApi, movementTypeMasterApi, outwardStatusMasterApi, type MdResource } from "./api";
import type { ListParams, MovementTypeDef, OutwardStatusDef, Page } from "./types";
import {
  lookupQueryOptions,
  transactionalQueryOptions,
  usePollingInterval,
} from "@/lib/polling";

const keys = {
  all: (r: MdResource) => ["masterdata", r] as const,
  list: (r: MdResource, p: ListParams) => ["masterdata", r, "list", p] as const,
};

/**
 * Resources whose rows change from the shop floor (scans, dispatch) and so are
 * polled. Everything else is master / reference data (docs/09 §2): it is read
 * once, kept for `LOOKUP_STALE_MS`, and refreshed by its own mutations or on
 * window focus — never on a timer.
 */
const TRANSACTIONAL: ReadonlySet<MdResource> = new Set<MdResource>(["sap-outwards"]);

export function useMdList<T>(resource: MdResource, params: ListParams = {}) {
  const interval = usePollingInterval();
  const transactional = TRANSACTIONAL.has(resource);
  // A lookup fetch (no `page` requested) never needs the server-side COUNT(*)
  // (docs/02 §4.3) — ask the service to skip it. Query key is unchanged.
  const query: ListParams & { with_total?: boolean } =
    !transactional && !("page" in params) ? { ...params, with_total: false } : params;
  return useQuery<Page<T>>({
    queryKey: keys.list(resource, params),
    queryFn: ({ signal }) => masterdataApi<T>(resource).list(query, { signal }),
    placeholderData: (prev) => prev,
    ...(transactional ? transactionalQueryOptions(interval) : lookupQueryOptions),
  });
}

/** The outward-status lookup table (code → label / dispatched flag). */
export function useOutwardStatusMaster() {
  return useQuery<OutwardStatusDef[]>({
    queryKey: ["masterdata", "outward-status-master"],
    queryFn: ({ signal }) => outwardStatusMasterApi({ signal }),
    ...lookupQueryOptions,
  });
}

/** The SAP movement-type lookup table (code → description). */
export function useMovementTypeMaster() {
  return useQuery<MovementTypeDef[]>({
    queryKey: ["masterdata", "movement-type-master"],
    queryFn: ({ signal }) => movementTypeMasterApi({ signal }),
    ...lookupQueryOptions,
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
