import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function Pagination({
  page,
  pages,
  total,
  size,
  onPageChange,
}: {
  page: number;
  pages: number;
  total: number;
  size: number;
  onPageChange: (page: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const btn =
    "ds-focus-ring inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-xs text-text-secondary hover:bg-surface-2 disabled:opacity-45 disabled:pointer-events-none";

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2.5">
      <p className="text-xs text-text-muted">
        {from}–{to} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-1">
        <button className={btn} onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="size-3.5" />
          Prev
        </button>
        <span className="px-2 text-xs text-text-secondary">
          Page {page} / {Math.max(pages, 1)}
        </span>
        <button
          className={cn(btn)}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
        >
          Next
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
