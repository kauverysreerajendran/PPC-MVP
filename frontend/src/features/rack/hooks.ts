"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rackApi } from "./api";
import type { Page, RackListParams, RackSlot } from "./types";

const keys = {
  all: ["rack", "slots"] as const,
  list: (p: RackListParams) => ["rack", "slots", "list", p] as const,
};

export function useRackList(params: RackListParams = {}) {
  return useQuery<Page<RackSlot>>({
    queryKey: keys.list(params),
    queryFn: ({ signal }) => rackApi.list(params, { signal }),
    staleTime: 2_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.all });
}

export function useRackCreate() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => rackApi.create(body),
    onSuccess: done,
  });
}

export function useRackUpdate() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      rackApi.update(id, body),
    onSuccess: done,
  });
}

export function useRackDelete() {
  const done = useInvalidate();
  return useMutation({ mutationFn: (id: string) => rackApi.remove(id), onSuccess: done });
}

export function useRackOccupy() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      rackApi.occupy(id, body),
    onSuccess: done,
  });
}

export function useRackRelease() {
  const done = useInvalidate();
  return useMutation({ mutationFn: (id: string) => rackApi.release(id), onSuccess: done });
}
