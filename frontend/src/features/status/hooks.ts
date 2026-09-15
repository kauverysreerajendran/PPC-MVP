"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { statusApi } from "./api";
import { lookupQueryOptions, transactionalQueryOptions, usePollingInterval } from "@/lib/polling";
import type { LineStatus, ResolvedStatus, StatusDefinition, StatusStage } from "./types";

export const statusKeys = {
  all: ["status"] as const,
  definitions: ["status", "definitions"] as const,
  lines: (refsKey: string) => ["status", "lines", refsKey] as const,
};

/** The status master — labels and tones for every stage. Rarely changes. */
export function useStatusDefinitions() {
  return useQuery<StatusDefinition[]>({
    queryKey: statusKeys.definitions,
    queryFn: ({ signal }) => statusApi.definitions({ signal }),
    ...lookupQueryOptions,
  });
}

/**
 * Current statuses of the SAP lines on screen, polled like the grids so a scan
 * or verify elsewhere shows up on the next tick. Returns a resolver that falls
 * back to a stage's initial status for lines that never reported one.
 */
export function useLineStatuses(refs: string[]) {
  const refsKey = useMemo(() => [...new Set(refs)].sort().join(","), [refs]);
  const definitions = useStatusDefinitions();
  const interval = usePollingInterval();
  const lines = useQuery({
    queryKey: statusKeys.lines(refsKey),
    queryFn: ({ signal }) => statusApi.lines({ refs: refsKey, page_size: 500 }, { signal }),
    enabled: refsKey.length > 0,
    placeholderData: (prev) => prev,
    ...transactionalQueryOptions(interval),
  });

  const byRef = useMemo(() => {
    const m = new Map<string, Partial<Record<StatusStage, LineStatus>>>();
    for (const l of lines.data?.items ?? []) {
      const entry = m.get(l.sap_reference_id) ?? {};
      entry[l.stage] = l;
      m.set(l.sap_reference_id, entry);
    }
    return m;
  }, [lines.data]);

  const initial = useMemo(() => {
    const m = new Map<StatusStage, StatusDefinition>();
    for (const d of definitions.data ?? []) if (d.is_initial) m.set(d.stage, d);
    return m;
  }, [definitions.data]);

  const statusOf = useCallback(
    (ref: string, stage: StatusStage): ResolvedStatus | null => {
      const reported = byRef.get(ref)?.[stage];
      if (reported) {
        return {
          code: reported.code,
          label: reported.label,
          tone: reported.tone,
          changed_at: reported.changed_at,
        };
      }
      const d = initial.get(stage);
      return d ? { code: d.code, label: d.label, tone: d.tone, changed_at: null } : null;
    },
    [byRef, initial],
  );

  return { statusOf, isLoading: lines.isLoading || definitions.isLoading, isError: lines.isError };
}
