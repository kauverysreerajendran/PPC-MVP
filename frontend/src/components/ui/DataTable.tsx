"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { TableSkeleton } from "./Skeleton";

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  accessor?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  width?: string;
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = false,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
  toolbar,
  footer,
  onRowClick,
  stickyHeader = true,
  initialSort = null,
  headerVariant = "default",
  columnDividers = false,
  emptyContent,
  compact = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  onRowClick?: (row: T) => void;
  stickyHeader?: boolean;
  initialSort?: SortState;
  /** "solid" = mixed-case dark header on a faint tinted background (matches SAP screens). */
  headerVariant?: "default" | "solid";
  /** thin vertical separators between header/body cells. */
  columnDividers?: boolean;
  /** custom node rendered in the table body when there are no rows (overrides the default empty state). */
  emptyContent?: ReactNode;
  /** dense grid: 12px body text and tighter row padding. */
  compact?: boolean;
}) {
  const [sort, setSort] = useState<SortState>(initialSort);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.accessor) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.accessor!(a) ?? "";
      const bv = col.accessor!(b) ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key === key
        ? s.dir === "asc"
          ? { key, dir: "desc" }
          : null
        : { key, dir: "asc" },
    );

  const align = (a?: "left" | "right" | "center") =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">{toolbar}</div>
      ) : null}

      {error ? (
        <ErrorState onRetry={onRetry} />
      ) : loading ? (
        <TableSkeleton cols={columns.length} />
      ) : sortedRows.length === 0 && columns.length === 0 ? (
        <EmptyState title={emptyTitle ?? "No records found"} description={emptyDescription} action={emptyAction} />
      ) : (
        <div className="overflow-x-auto">
          <table className={cn("w-full border-collapse", compact ? "text-xs" : "text-sm")}>
            <thead
              className={cn(
                "tracking-wide",
                headerVariant === "solid"
                  ? "bg-[color-mix(in_srgb,var(--color-primary)_7%,var(--color-surface))] text-[11px] text-text-secondary"
                  : "bg-surface-2 text-xs uppercase text-text-muted",
                stickyHeader && "sticky top-0 z-[1]",
              )}
            >
              <tr>
                {columns.map((c, ci) => {
                  const dir = sort?.key === c.key ? sort.dir : null;
                  return (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={
                      c.sortable
                        ? dir === "asc"
                          ? "ascending"
                          : dir === "desc"
                            ? "descending"
                            : "none"
                        : undefined
                    }
                    className={cn(
                      "whitespace-nowrap border-b border-border font-medium",
                      headerVariant === "solid" ? "px-2 py-2 leading-tight" : "px-3 py-2.5",
                      align(c.align),
                      columnDividers && ci > 0 && "border-l border-border",
                    )}
                  >
                    {c.sortable ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="select-text">{c.header}</span>
                        <button
                          type="button"
                          aria-label={`Sort by ${c.header}`}
                          onClick={() => toggleSort(c.key)}
                          className="ds-focus-ring rounded hover:text-text-secondary"
                        >
                          {dir === "desc" ? (
                            <ArrowDown className="size-3 text-primary" aria-hidden />
                          ) : (
                            <ArrowUp
                              className={cn("size-3", dir === "asc" ? "text-primary" : "opacity-40")}
                              aria-hidden
                            />
                          )}
                        </button>
                      </span>
                    ) : (
                      <span className="select-text">{c.header}</span>
                    )}
                  </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-0">
                    {emptyContent ?? (
                      <EmptyState
                        title={emptyTitle ?? "No records found"}
                        description={emptyDescription}
                        action={emptyAction}
                      />
                    )}
                  </td>
                </tr>
              ) : null}
              {sortedRows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-border last:border-0 transition-colors hover:bg-surface-2",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {columns.map((c, ci) => (
                    <td
                      key={c.key}
                      className={cn(
                        "whitespace-nowrap text-text",
                        compact ? "px-2 py-1.5" : headerVariant === "solid" ? "px-2 py-2" : "px-3 py-2.5",
                        align(c.align),
                        columnDividers && ci > 0 && "border-l border-border",
                      )}
                    >
                      {c.render ? c.render(row) : String(c.accessor?.(row) ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer}
    </div>
  );
}
