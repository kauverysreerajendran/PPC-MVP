"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, CloudOff, Copy, RotateCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

/** A titled card of the result: small uppercase-tracked header, like the app's. */
export function Panel({
  icon,
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  icon: ReactNode;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const id = useId();
  return (
    <Card className={cn("min-w-0", className)}>
      <section aria-labelledby={id}>
        <header className="flex min-h-11 items-center justify-between gap-2 border-b border-border px-4 py-2">
          <h2
            id={id}
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary [&_svg]:size-3.5 [&_svg]:text-primary"
          >
            {icon}
            {title}
          </h2>
          {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
        </header>
        <div className={cn("p-4", bodyClassName)}>{children}</div>
      </section>
    </Card>
  );
}

/**
 * A panel whose service could not be reached: says what is missing, keeps the
 * rest of the page, and offers a retry.
 */
export function PanelNotice({
  title,
  children,
  onRetry,
}: {
  title: string;
  children: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-dashed border-border-strong bg-surface-2 px-3 py-2.5 text-xs"
    >
      <CloudOff className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-text">{title}</p>
        <p className="mt-0.5 text-text-secondary">{children}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="ds-focus-ring inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 py-1 font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary"
        >
          <RotateCw className="size-3" aria-hidden />
          Retry
        </button>
      ) : null}
    </div>
  );
}

/**
 * An identifier that copies itself on click, with a brief "Copied" flag that
 * floats above it (no layout shift) and a polite announcement.
 */
export function Copyable({
  value,
  label,
  className,
  children,
}: {
  value: string;
  /** what the value is, for the button's accessible name — "Box UID" */
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(value)
          .then(() => setCopied(true))
          .catch(() => undefined);
      }}
      aria-label={`Copy ${label} ${value}`}
      title={`Copy ${label}`}
      className={cn(
        "ds-focus-ring group/copy relative inline-flex max-w-full items-center gap-1 rounded-[var(--radius-xs)] text-left transition-colors hover:text-primary",
        className,
      )}
    >
      <span className="min-w-0 truncate">{children ?? value}</span>
      {copied ? (
        <Check className="size-3 shrink-0 text-[var(--color-success)]" aria-hidden />
      ) : (
        <Copy
          className="size-3 shrink-0 opacity-0 transition-opacity group-hover/copy:opacity-60 group-focus-visible/copy:opacity-60"
          aria-hidden
        />
      )}
      {copied ? (
        <span
          aria-hidden
          className="ds-animate-fade pointer-events-none absolute -top-6 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-xs)] bg-text px-1.5 py-0.5 font-sans text-[10px] font-medium tracking-normal text-surface shadow-[var(--shadow-md)]"
        >
          Copied
        </span>
      ) : null}
      <span role="status" className="sr-only">
        {copied ? `${label} copied` : ""}
      </span>
    </button>
  );
}

/** One label / value pair of an identity grid. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-text-muted">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-[13px] font-medium text-text">{children}</dd>
    </div>
  );
}

/** "—" for a value that is genuinely not known. */
export function Dash() {
  return <span className="text-text-muted">—</span>;
}
