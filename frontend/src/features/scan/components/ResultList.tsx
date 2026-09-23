"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { ListTree, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtNum } from "@/features/sap-inward/utils/format";
import { cn } from "@/lib/cn";
import type { StageStatuses } from "../hooks";
import type { ScanLine } from "../resolve";
import { buildTimeline } from "../timeline";
import { lineFacts } from "./LinePanels";

export interface ResultListHandle {
  /** move keyboard focus into the list (on the selected line) */
  focus: () => void;
}

/** Where a line stands, in one badge: its current stage's status. */
function stageOf(line: ScanLine, statuses: StageStatuses | undefined) {
  const steps = buildTimeline(statuses ?? {}, line.outward);
  return steps.find((s) => s.state === "current") ?? steps[0]!;
}

/**
 * The lines a PO / DC / model covers, one compact row each. A listbox: ↑ / ↓
 * move, Enter or click opens the line in the detail below.
 */
export const ResultList = forwardRef<
  ResultListHandle,
  {
    title: string;
    lines: ScanLine[];
    selected: string;
    onSelect: (ref: string) => void;
    statuses: Map<string, StageStatuses>;
  }
>(function ResultList({ title, lines, selected, onSelect, statuses }, ref) {
  const selectedIndex = Math.max(0, lines.findIndex((l) => l.ref === selected));
  const [focusIndex, setFocusIndex] = useState(selectedIndex);
  const options = useRef<(HTMLDivElement | null)[]>([]);

  const move = (i: number) => {
    const next = Math.min(lines.length - 1, Math.max(0, i));
    setFocusIndex(next);
    options.current[next]?.focus();
    options.current[next]?.scrollIntoView?.({ block: "nearest" });
  };

  useImperativeHandle(ref, () => ({ focus: () => move(selectedIndex) }));

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(focusIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(focusIndex - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      move(0);
    } else if (e.key === "End") {
      e.preventDefault();
      move(lines.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const l = lines[focusIndex];
      if (l) onSelect(l.ref);
    }
  }

  return (
    <div className="ds-animate-fade-up mb-4 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h2
          id="scan-results-title"
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary"
        >
          <ListTree className="size-3.5 text-primary" aria-hidden />
          {title}
        </h2>
        <p className="hidden text-[11px] text-text-muted sm:block">
          <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to move ·{" "}
          <kbd className="font-sans">Enter</kbd> to open
        </p>
      </div>
      <div
        role="listbox"
        aria-labelledby="scan-results-title"
        onKeyDown={onKeyDown}
        className="max-h-[232px] overflow-y-auto p-1"
      >
        {lines.map((l, i) => {
          const x = lineFacts(l);
          const stage = stageOf(l, statuses.get(l.ref));
          const isSelected = l.ref === selected;
          return (
            <div
              key={l.ref}
              ref={(el) => {
                options.current[i] = el;
              }}
              role="option"
              aria-selected={isSelected}
              tabIndex={i === focusIndex ? 0 : -1}
              onClick={() => {
                setFocusIndex(i);
                onSelect(l.ref);
              }}
              onFocus={() => setFocusIndex(i)}
              className={cn(
                "ds-focus-ring grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-[var(--radius-sm)] border-l-2 px-3 py-2 text-xs transition-colors sm:grid-cols-[8.5rem_minmax(0,1fr)_5.5rem_4.5rem_8.5rem]",
                isSelected
                  ? "border-primary bg-[color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]"
                  : "border-transparent hover:bg-surface-2",
              )}
            >
              <span className="min-w-0 truncate font-mono text-[13px] font-semibold text-text">
                {x.boxUid ?? <span className="font-sans text-xs font-medium text-text-muted">No Box UID</span>}
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-mono text-[11px] text-text-muted">{x.ref}</span>
                {x.shortage ? (
                  <span className="ds-chip ds-chip-orange shrink-0 text-[10px]">
                    <TriangleAlert className="size-2.5" aria-hidden />
                    Back-order
                  </span>
                ) : null}
              </span>
              <span className="hidden min-w-0 sm:block">
                {x.model ? <span className="ds-chip font-mono">{x.model}</span> : null}
              </span>
              <span className="hidden text-right tabular-nums text-text sm:block">
                {fmtNum(x.quantity)}
              </span>
              <span className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto">
                <StatusBadge label={stage.label} tone={stage.tone} className="text-[11px]" />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
