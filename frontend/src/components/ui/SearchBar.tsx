"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export function SearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface pl-8 pr-8 text-sm text-text placeholder:text-text-muted outline-none focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)]"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="ds-focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
