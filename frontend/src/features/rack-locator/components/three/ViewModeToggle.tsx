"use client";

import { Box, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/cn";
import { setLocatorViewMode, type LocatorViewMode } from "./sceneKit";

/**
 * 3D / Grid switch; the choice is remembered for both the overview and the
 * rack. `tabs` is the larger "3D View | Grid View" pair that heads the rack card.
 */
export function ViewModeToggle({
  mode,
  className,
  variant = "pill",
  compact = false,
}: {
  mode: LocatorViewMode;
  className?: string;
  variant?: "pill" | "tabs";
  /** tabs only: a shorter pair that fits a single-row toolbar */
  compact?: boolean;
}) {
  const tabs = variant === "tabs";
  const opts: { value: LocatorViewMode; label: string; icon: typeof Box }[] = [
    { value: "3d", label: tabs ? "3D View" : "3D", icon: Box },
    { value: "grid", label: tabs ? "Grid View" : "Grid", icon: LayoutGrid },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Rack view"
      className={cn(
        tabs
          ? "inline-flex gap-1 rounded-[12px] border border-border bg-surface-2 p-1"
          : "inline-flex rounded-full border border-border bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] p-0.5 shadow-[var(--shadow-sm)] backdrop-blur",
        className,
      )}
    >
      {opts.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          onClick={() => setLocatorViewMode(value)}
          className={cn(
            "ds-focus-ring inline-flex items-center font-semibold transition-colors",
            tabs
              ? compact
                ? "gap-1.5 rounded-[8px] px-3 py-1 text-[13px]"
                : "gap-2 rounded-[9px] px-4 py-1.5 text-sm"
              : "gap-1 rounded-full px-2.5 py-1 text-xs",
            mode === value
              ? cn(
                  "text-[var(--color-primary-fg)]",
                  tabs
                    ? "bg-[linear-gradient(135deg,var(--color-primary),color-mix(in_srgb,var(--color-primary)_70%,#062a2a))] shadow-[var(--shadow-sm)]"
                    : "bg-primary",
                )
              : "text-text-secondary hover:text-text",
          )}
        >
          <Icon className={tabs ? "size-4" : "size-3.5"} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
