"use client";

import { useState } from "react";
import { ChevronRight, LocateFixed, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { LocateResult, Recommendation } from "../types";
import { num } from "./trayStyles";

/**
 * The Locate Me result. The order is the backend's — it scores each free tray
 * on walking distance along the aisle and reach height; this list renders that
 * ranking as-is, with no client-side re-sorting or "is it empty?" guessing.
 *
 * `strip` lays the ranking out as a row of numbered cards under the rack, with
 * its own Locate Me button.
 */
export function EmptyLocationRecommendation(props: {
  bare?: boolean;
  result: LocateResult | null;
  selectedCode?: string | undefined;
  onSelect: (rec: Recommendation) => void;
  onMore?: (() => void) | undefined;
  loading?: boolean;
  layout?: "list" | "strip";
  onLocate?: (() => void) | undefined;
}) {
  return props.layout === "strip" ? <NearestStrip {...props} /> : <NearestList {...props} />;
}

const STRIP_SIZE = 5;

function NearestStrip({
  result,
  selectedCode,
  onSelect,
  onMore,
  loading,
  onLocate,
}: {
  result: LocateResult | null;
  selectedCode?: string | undefined;
  onSelect: (rec: Recommendation) => void;
  onMore?: (() => void) | undefined;
  loading?: boolean;
  onLocate?: (() => void) | undefined;
}) {
  const recs = result?.recommendations ?? [];
  // one row of five; "View more" opens the rest, then asks the backend for more
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? recs : recs.slice(0, STRIP_SIZE);
  const hiddenHere = recs.length > visible.length;
  const moreOnServer = !!onMore && !!result && result.total_empty > recs.length;
  return (
    <section
      aria-label="Nearest empty locations"
      className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text">
          <MapPin className="size-4 text-primary" />
          Nearest Empty Locations
          {result ? (
            <span className="text-xs font-normal tabular-nums text-text-muted">
              · {num(result.total_empty)} free
            </span>
          ) : null}
        </h2>
        <div className="flex items-center gap-2">
          {hiddenHere || moreOnServer ? (
            <button
              type="button"
              onClick={() => (hiddenHere ? setShowAll(true) : onMore?.())}
              className="ds-focus-ring inline-flex items-center gap-0.5 rounded text-xs font-medium text-text-secondary hover:text-text"
            >
              View more
              <ChevronRight className="size-3.5" />
            </button>
          ) : null}
          {onLocate ? (
            <Button variant="secondary" size="sm" loading={!!loading} onClick={onLocate}>
              <LocateFixed className="size-3.5" />
              Locate Me
            </Button>
          ) : null}
        </div>
      </div>

      {loading && recs.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-secondary">Searching the aisle…</p>
      ) : !result ? (
        <p className="py-4 text-center text-xs text-text-secondary">
          Run <span className="font-medium text-text">Locate Me</span> to rank the free trays
          nearest to you.
        </p>
      ) : recs.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-secondary">No free trays in this selection.</p>
      ) : (
        <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {visible.map((rec) => {
            const on = rec.code === selectedCode;
            return (
              <li key={rec.code}>
                <button
                  type="button"
                  onClick={() => onSelect(rec)}
                  aria-current={on ? "true" : undefined}
                  title={rec.reason}
                  className={cn(
                    "ds-focus-ring group flex w-full items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors",
                    on
                      ? "border-primary bg-[var(--color-primary-light)]"
                      : "border-border bg-surface hover:border-[color-mix(in_srgb,var(--color-primary)_40%,var(--color-border))] hover:bg-surface-2",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums",
                      on ? "bg-primary text-[var(--color-primary-fg)]" : "border border-border text-text-secondary",
                    )}
                  >
                    {rec.rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs font-semibold text-text">{rec.code}</span>
                    <span className="block truncate text-[11px] text-text-muted">
                      {on ? "Current selection" : `${Math.round(rec.distance_m)} m away`}
                    </span>
                  </span>
                  {on ? (
                    <Navigation className="size-4 shrink-0 text-primary" aria-hidden />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function NearestList({
  result,
  selectedCode,
  onSelect,
  onMore,
  loading,
  onLocate,
  bare = false,
}: {
  /** just the ranked list, no card or heading — for a disclosure elsewhere */
  bare?: boolean;
  result: LocateResult | null;
  selectedCode?: string | undefined;
  onSelect: (rec: Recommendation) => void;
  onMore?: (() => void) | undefined;
  loading?: boolean;
  onLocate?: (() => void) | undefined;
}) {
  return (
    <div
      className={cn(
        !bare &&
          "rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]",
      )}
    >
      <div className={cn("mb-3 flex items-center justify-between gap-2", bare && "hidden")}>
        <h2 className="flex items-center gap-2 text-base font-semibold text-text">
          <MapPin className="size-4 text-primary" />
          Nearest Empty Locations
        </h2>
        {onLocate ? (
          <Button variant="secondary" size="sm" loading={!!loading} onClick={onLocate}>
            <LocateFixed className="size-3.5" />
            Locate Me
          </Button>
        ) : result ? (
          <span className="text-[10px] tabular-nums text-text-muted">
            {num(result.total_empty)} free
          </span>
        ) : null}
      </div>

      {loading && !result ? (
        <p className="py-6 text-center text-xs text-text-secondary">Searching the aisle…</p>
      ) : !result ? (
        <p className="py-6 text-center text-xs text-text-secondary">
          Run <span className="font-medium text-text">Locate Me</span> to rank the free trays
          nearest to you.
        </p>
      ) : result.recommendations.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-secondary">
          No free trays in this selection.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {result.recommendations.map((rec) => {
            const on = rec.code === selectedCode;
            return (
              <li key={rec.code}>
                <button
                  type="button"
                  onClick={() => onSelect(rec)}
                  aria-current={on ? "true" : undefined}
                  title={rec.reason}
                  className={cn(
                    "ds-focus-ring group flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-left text-sm transition-colors",
                    on
                      ? "border-primary bg-[var(--color-primary-light)]"
                      : "border-border hover:bg-surface-2",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums",
                      on ? "bg-primary text-[var(--color-primary-fg)]" : "border border-border text-text-secondary",
                    )}
                  >
                    {rec.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-text">
                    {rec.code}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
                    {on ? "Current selection" : `${Math.round(rec.distance_m)} m away`}
                  </span>
                  {on ? (
                    <Navigation className="size-3.5 shrink-0 text-primary" aria-hidden />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {onMore &&
      result &&
      result.recommendations.length > 0 &&
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
