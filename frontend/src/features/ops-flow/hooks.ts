"use client";

import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { opsFlowApi } from "./api";
import { STAGES, type StageKey, type StatusRefs } from "./types";
import { useStatusDefinitions } from "@/features/status/hooks";
import { transactionalQueryOptions, usePollingInterval } from "@/lib/polling";
import type { StatusDefinition, StatusStage, StatusToneName } from "@/features/status/types";

export const opsFlowKeys = {
  all: ["ops-flow"] as const,
  refs: (stage: StatusStage, code: string) => ["ops-flow", "refs", stage, code] as const,
};

/** One status inside a stage, with its live count and its master wording. */
export interface CodeCount {
  code: string;
  label: string;
  tone: StatusToneName;
  count: number;
}

export interface StageSnapshot {
  key: StageKey;
  title: string;
  hint: string;
  href: string;
  stage: StatusStage;
  breakdown: CodeCount[];
  /** Every line sitting in this stage right now. */
  total: number;
  /**
   * The part of `total` that is still work in hand. A status the master tones
   * `success` is finished work, anything else is waiting — so the bottleneck
   * accent follows the master and no threshold is written into the UI.
   */
  pending: number;
}

/** (stage, code) pairs to fetch, flattened from STAGES — one request each. */
const PAIRS: readonly { stage: StatusStage; code: string }[] = STAGES.flatMap((s) =>
  s.codes.map((code) => ({ stage: s.stage, code })),
);

const keyOf = (stage: StatusStage, code: string) => `${stage}:${code}`;

/**
 * Live picture of the five-stage flow: one `/status/refs` call per status,
 * polled on the shared transactional cadence (lib/polling.ts) so a scan or a
 * verify anywhere else in the app shows up here on the next tick. Labels and
 * tones come from the status master, which is cached as lookup data.
 */
export function useOpsFlow() {
  const definitions = useStatusDefinitions();
  const interval = usePollingInterval();

  // useQueries builds its result tuple from a mapped array, which it cannot
  // infer element-wise; every query here returns the same shape.
  const results = useQueries({
    queries: PAIRS.map((p) => ({
      queryKey: opsFlowKeys.refs(p.stage, p.code),
      queryFn: ({ signal }: { signal: AbortSignal }) => opsFlowApi.refs(p.stage, p.code, { signal }),
      placeholderData: (prev: StatusRefs | undefined) => prev,
      ...transactionalQueryOptions(interval),
    })),
  }) as UseQueryResult<StatusRefs, Error>[];

  const countByKey = new Map<string, number>();
  PAIRS.forEach((p, i) => {
    const data = results[i]?.data;
    if (data) countByKey.set(keyOf(p.stage, p.code), data.count);
  });

  const defByKey = new Map<string, StatusDefinition>();
  for (const d of definitions.data ?? []) defByKey.set(keyOf(d.stage, d.code), d);

  const stages: StageSnapshot[] = STAGES.map((s) => {
    const breakdown: CodeCount[] = s.codes.map((code) => {
      const def = defByKey.get(keyOf(s.stage, code));
      return {
        code,
        label: def?.label ?? code,
        tone: def?.tone ?? "neutral",
        count: countByKey.get(keyOf(s.stage, code)) ?? 0,
      };
    });
    return {
      key: s.key,
      title: s.title,
      hint: s.hint,
      href: s.href,
      stage: s.stage,
      breakdown,
      total: breakdown.reduce((n, b) => n + b.count, 0),
      pending: breakdown.reduce((n, b) => n + (b.tone === "success" ? 0 : b.count), 0),
    };
  });

  const updatedAt = results.reduce((newest, r) => Math.max(newest, r?.dataUpdatedAt ?? 0), 0);

  return {
    stages,
    maxPending: stages.reduce((n, s) => Math.max(n, s.pending), 0),
    maxTotal: stages.reduce((n, s) => Math.max(n, s.total), 0),
    grandTotal: stages.reduce((n, s) => n + s.total, 0),
    isLoading: definitions.isLoading || results.some((r) => r?.isLoading),
    isError: definitions.isError || results.some((r) => r?.isError),
    isFetching: definitions.isFetching || results.some((r) => r?.isFetching),
    updatedAt,
    refetch: () => {
      void definitions.refetch();
      for (const r of results) void r?.refetch();
    },
  };
}
