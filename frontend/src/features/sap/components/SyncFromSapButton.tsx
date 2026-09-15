"use client";

import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useSyncRuns, useTriggerSapSync } from "../hooks";

/**
 * Pull SAP inward lines on demand.
 *
 * The SAP Integration service also pulls on its own schedule
 * (`services/sap-integration/app/sync_loop.py`), so this button is "now,
 * please" rather than the only way data arrives. Both go through the same
 * endpoint and the same upsert, so pressing it twice cannot duplicate a line.
 */
export function SyncFromSapButton() {
  const toast = useToast();
  const sync = useTriggerSapSync();
  const runs = useSyncRuns();
  const last = runs.data?.[0];
  const lastAt = last?.finished_at ?? last?.started_at ?? null;

  async function pull() {
    try {
      const run = await sync.mutateAsync(undefined);
      toast("success", `SAP sync complete — ${run.records_ingested} lines ingested.`);
    } catch {
      toast("error", "SAP sync failed. The previous records are unchanged.");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {lastAt ? (
        <span className="hidden text-[11px] text-text-muted sm:inline" suppressHydrationWarning>
          Last sync {new Date(lastAt).toLocaleTimeString([], { hour12: false })}
          {last?.status === "FAILED" ? " · failed" : null}
        </span>
      ) : null}
      <button
        type="button"
        onClick={pull}
        disabled={sync.isPending}
        aria-label="Sync inward records from SAP now"
        className="ds-focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-55"
      >
        <RefreshCw className={sync.isPending ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
        {sync.isPending ? "Syncing…" : "Sync from SAP"}
      </button>
    </span>
  );
}
