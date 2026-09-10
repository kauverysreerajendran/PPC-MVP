"use client";

import { Footprints, Navigation, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LocateResult, Recommendation } from "../types";
import { num } from "./trayStyles";

/**
 * The Locate Me result. The order is the backend's: it scores each free tray on
 * walking distance along the aisle and reach height, and this list renders that
 * ranking as-is — no client-side re-sorting, no client-side "is it empty?".
 */
export function EmptyLocationRecommendation({
  result,
  selectedCode,
  onSelect,
  loading,
}: {
  result: LocateResult | null;
  selectedCode?: string | undefined;
  onSelect: (rec: Recommendation) => void;
  loading?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <Navigation className="size-3.5 text-primary" />
          Nearest Empty Locations
        </span>
        {result ? (
          <span className="text-[10px] tabular-nums text-text-muted">
            {num(result.total_empty)} free
          </span>
        ) : null}
      </header>

      {loading ? (
        <p className="px-3.5 py-6 text-center text-xs text-text-secondary">
          Searching the aisle…
        </p>
      ) : !result ? (
        <p className="px-3.5 py-6 text-center text-xs text-text-secondary">
          Run <span className="font-medium text-text">Locate Me</span> to rank the free
          trays nearest to you.
        </p>
      ) : result.recommendations.length === 0 ? (
        <p className="px-3.5 py-6 text-center text-xs text-text-secondary">
          No free trays in this selection.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {result.recommendations.map((rec) => (
            <li key={rec.code}>
              <button
                type="button"
                onClick={() => onSelect(rec)}
                aria-current={rec.code === selectedCode ? "true" : undefined}
                className={cn(
                  "ds-focus-ring flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors",
                  rec.code === selectedCode ? "bg-teal-50 dark:bg-[#12333a]" : "hover:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                    rec.rank === 1
                      ? "bg-primary text-[var(--color-primary-fg)]"
                      : "bg-surface-2 text-text-secondary",
                  )}
                >
                  {rec.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs font-medium">
                    {rec.code}
                  </span>
                  <span className="block truncate text-[10px] text-text-muted">
                    {rec.reason}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[10px] tabular-nums text-text-secondary">
                  <Footprints className="size-3" aria-hidden />
                  {rec.distance_m} m
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {result && result.recommendations[0] ? (
        <footer className="flex items-center gap-1.5 border-t border-border px-3.5 py-2 text-[10px] text-text-muted">
          <Sparkles className="size-3 text-primary" aria-hidden />
          Recommended:{" "}
          <span className="font-medium text-text-secondary">
            {result.recommendations[0].code}
          </span>
        </footer>
      ) : null}
    </div>
  );
}
