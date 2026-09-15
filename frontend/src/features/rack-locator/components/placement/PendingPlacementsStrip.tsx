"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useInwardLines } from "@/features/sap-inward/hooks";
import { useLineStatuses } from "@/features/status/hooks";

const PAGE_SIZE = 25;
// Bounded fetch (docs/02-backend-architecture.md §4.1 caps a page at 100):
// the "not yet placed" filter has no server-side equivalent (the Status
// service filters by exact stage/code, not "code != PLACED" — see
// services/status/app/api.py:138-158), so it is applied client-side over
// this one bounded batch instead of an unbounded scan.
const FETCH_SIZE = 100;

/**
 * Collapsible strip on the plain Rack Locator (no `?place`): received lines
 * that still need a rack, so the operator does not have to go back to SAP
 * Inward to start the next one.
 */
export function PendingPlacementsStrip() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [page, setPage] = useState(1);

  const lines = useInwardLines({ page_size: FETCH_SIZE });
  const received = useMemo(
    () => (lines.data?.items ?? []).filter((l) => l.received_pieces > 0),
    [lines.data],
  );
  const lineStatus = useLineStatuses(received.map((l) => l.sap_reference_id));

  const pending = useMemo(
    () =>
      received.filter((l) => lineStatus.statusOf(l.sap_reference_id, "rack")?.code !== "PLACED"),
    [received, lineStatus],
  );
  const pageCount = Math.max(1, Math.ceil(pending.length / PAGE_SIZE));
  const pageRows = pending.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ds-focus-ring flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-text">
          <PackagePlus className="size-4 text-primary" />
          Received lots waiting for a rack
          {!lines.isLoading && !lineStatus.isLoading ? (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-secondary">
              {pending.length}
            </span>
          ) : null}
        </span>
        {open ? (
          <ChevronUp className="size-4 text-text-muted" />
        ) : (
          <ChevronDown className="size-4 text-text-muted" />
        )}
      </button>

      {open ? (
        <div className="border-t border-border px-4 py-3">
          {lines.isError ? (
            <ErrorState title="Unable to load received lines" onRetry={() => void lines.refetch()} />
          ) : lines.isLoading || lineStatus.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : pending.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-secondary">
              All received lots are in racks.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {pageRows.map((l) => {
                  const rackStatus = lineStatus.statusOf(l.sap_reference_id, "rack");
                  const partial = rackStatus?.code === "PARTIALLY_PLACED";
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <span className="ds-chip ds-chip-0 font-mono">{l.box_uid ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate text-text-secondary">
                        {l.model_no ?? "no model"} · {l.lot_no ?? "—"}
                      </span>
                      {/* the exact remaining count needs a per-line placed lookup
                          (usePlacedPieces), which does not scale to a 25-row list
                          without an N+1 query fan-out — so a partially placed line
                          is flagged instead of showing a possibly-overstated number */}
                      {partial ? (
                        <StatusBadge label="Partially placed" tone="orange" />
                      ) : (
                        <span className="tabular-nums text-text-muted">
                          {l.received_pieces} pcs received
                        </span>
                      )}
                      <Button
                        size="sm"
                        onClick={() => router.push(`/rack-locator?place=${encodeURIComponent(l.id)}`)}
                      >
                        Place
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {pageCount > 1 ? (
                <div className="mt-3 flex items-center justify-between text-xs text-text-secondary">
                  <span>
                    Page {page} / {pageCount}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page >= pageCount}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
