import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "default" | "success" | "warning" | "danger" | "info";

const iconTone: Record<Tone, string> = {
  default: "bg-teal-50 text-teal-700 dark:bg-[#12333a] dark:text-teal-300",
  success: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  danger: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
  info: "bg-[var(--color-info-bg)] text-[var(--color-info)]",
};

export function KpiCard({
  label,
  value,
  icon,
  tone = "default",
  delta,
  hint,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  delta?: { value: string; direction: "up" | "down"; positive?: boolean };
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
        {icon ? (
          <span className={cn("flex size-8 items-center justify-center rounded-[var(--radius-sm)] [&>svg]:size-4", iconTone[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              delta.positive ? "text-[var(--color-success)]" : "text-[var(--color-danger)]",
            )}
          >
            {delta.direction === "up" ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {delta.value}
          </span>
        ) : null}
        {hint ? <span className="text-text-muted">{hint}</span> : null}
      </div>
    </div>
  );
}
