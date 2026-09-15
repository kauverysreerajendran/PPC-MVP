"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LocateResult, Recommendation } from "../types";
import { num } from "./trayStyles";

/**
 * The Locate Me result. The order is the backend's — it scores each free tray
 * on walking distance along the aisle and reach height; this list renders that
 * ranking as-is, with no client-side re-sorting or "is it empty?" guessing.
 */
export function EmptyLocationRecommendation({
  result,
  selectedCode,
  onSelect,
  onMore,
  loading,
}: {
  result: LocateResult | null;
  selectedCode?: string | undefined;
  onSelect: (rec: Recommendation) => void;
  onMore?: (() => void) | undefined;
  loading?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text">
          <MapPin className="size-3.5 text-primary" />
          Nearest Empty Locations
        </h2>
        {result ? (
          <span className="text-[10px] tabular-nums text-text-muted">
            {num(result.total_empty)} free
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="py-6 text-center text-xs text-text-secondary">Searching the aisle…</p>
      ) : !result ? (
        <p className="py-6 text-center text-xs text-text-secondary">
          Run <span className="font-medium text-text">Locate Me</span> to rank the free
          trays nearest to you.
        </p>
      ) : result.recommendations.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-secondary">
          No free trays in this selection.
        </p>
      ) : (
        <ul className="space-y-1">
          {result.recommendations.map((rec) => (
            <li key={rec.code}>
              <button
                type="button"
                onClick={() => onSelect(rec)}
                aria-current={rec.code === selectedCode ? "true" : undefined}
                title={rec.reason}
                className={cn(
                  "ds-focus-ring flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition-colors",
                  rec.code === selectedCode
                    ? "bg-teal-50 dark:bg-[#12333a]"
                    : "hover:bg-surface-2",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-text-secondary">
                  <MapPin className="size-3 shrink-0 text-text-muted" aria-hidden />
                  <span className="truncate tabular-nums">
                    {rec.rack_code} - S{rec.shelf_no} - R{rec.row_no} - T
                    {String(rec.tray_no).padStart(2, "0")}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-text-muted">
                  {Math.round(rec.distance_m)} m
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {onMore && result && result.recommendations.length > 0 &&
      result.total_empty > result.recommendations.length ? (
        <button
          type="button"
          onClick={onMore}
          className="ds-focus-ring mt-3 flex w-full items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-border py-2 text-sm text-text-secondary transition-colors hover:bg-surface-2"
        >
          View More
          <ChevronRight className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
