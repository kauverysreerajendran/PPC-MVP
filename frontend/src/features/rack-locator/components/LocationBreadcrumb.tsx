"use client";

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export type LocationCrumb = {
  /** e.g. "Aisle" */
  kind: string;
  /** e.g. "R" */
  value: string;
  onClick?: (() => void) | undefined;
};

/**
 * Warehouse -> Aisle -> Rack -> Shelf -> Row -> Tray.
 *
 * Each level names what it is, because "K / S4 / R2 / T05" on its own is only
 * readable to someone who already knows the scheme.
 */
export function LocationBreadcrumb({
  crumbs,
  className,
}: {
  crumbs: LocationCrumb[];
  className?: string;
}) {
  if (crumbs.length === 0) return null;
  return (
    <nav
      aria-label="Storage location"
      className={cn("flex flex-wrap items-center gap-1 text-xs", className)}
    >
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        const body = (
          <>
            <span className="text-text-muted">{crumb.kind}</span>{" "}
            <span className={cn("font-medium", last ? "text-text" : "text-text-secondary")}>
              {crumb.value}
            </span>
          </>
        );
        return (
          <Fragment key={`${crumb.kind}-${crumb.value}-${i}`}>
            {crumb.onClick && !last ? (
              <button
                type="button"
                onClick={crumb.onClick}
                className="ds-focus-ring rounded px-1 py-0.5 hover:bg-surface-2 hover:text-text"
              >
                {body}
              </button>
            ) : (
              <span className="px-1 py-0.5">{body}</span>
            )}
            {!last ? (
              <ChevronRight className="size-3 text-text-muted" aria-hidden />
            ) : null}
          </Fragment>
        );
      })}
    </nav>
  );
}
