"use client";

import { cn } from "@/lib/cn";

export type TableTab<K extends string> = {
  key: K;
  label: string;
  /** rows behind the tab — `undefined` until its count has loaded */
  count?: number | undefined;
};

/**
 * The Main Table / Complete Table switch used above the SAP grids: a segmented
 * control whose segments each carry a row count. Extracted from SAP Outward so
 * SAP Inward wears exactly the same one.
 */
export function TableTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly TableTab<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex rounded-[var(--radius-md)] border border-border bg-surface-2 p-0.5"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "ds-focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1 text-xs font-medium transition-colors",
            value === t.key
              ? "bg-primary-light text-primary shadow-[var(--shadow-sm)]"
              : "text-text-secondary hover:text-text",
          )}
        >
          {t.label}
          <span
            className={cn(
              "rounded-full px-1.5 text-[10px] tabular-nums",
              value === t.key ? "bg-white/60 text-primary" : "bg-surface text-text-muted",
            )}
          >
            {t.count ?? "—"}
          </span>
        </button>
      ))}
    </div>
  );
}
