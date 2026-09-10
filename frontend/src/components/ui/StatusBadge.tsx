import { cn } from "@/lib/cn";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "progress";

export type StatusKey =
  | "pending"
  | "ready"
  | "in_progress"
  | "in-progress"
  | "completed"
  | "passed"
  | "failed"
  | "rejected"
  | "blocked"
  | "on_hold"
  | "on-hold"
  | "active"
  | "archived";

const MAP: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "neutral" },
  ready: { label: "Ready", tone: "info" },
  in_progress: { label: "In Progress", tone: "progress" },
  "in-progress": { label: "In Progress", tone: "progress" },
  completed: { label: "Completed", tone: "success" },
  passed: { label: "Passed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  rejected: { label: "Rejected", tone: "danger" },
  blocked: { label: "Blocked", tone: "warning" },
  on_hold: { label: "On Hold", tone: "warning" },
  "on-hold": { label: "On Hold", tone: "warning" },
  active: { label: "Active", tone: "success" },
  archived: { label: "Archived", tone: "neutral" },
};

const TONES: Record<StatusTone, string> = {
  neutral: "bg-surface-2 text-text-secondary ring-border-strong",
  info: "bg-[var(--color-info-bg)] text-[var(--color-info)] ring-[color-mix(in_srgb,var(--color-info)_30%,transparent)]",
  success:
    "bg-[var(--color-success-bg)] text-[var(--color-success)] ring-[color-mix(in_srgb,var(--color-success)_30%,transparent)]",
  warning:
    "bg-[var(--color-warning-bg)] text-[var(--color-warning)] ring-[color-mix(in_srgb,var(--color-warning)_30%,transparent)]",
  danger:
    "bg-[var(--color-danger-bg)] text-[var(--color-danger)] ring-[color-mix(in_srgb,var(--color-danger)_30%,transparent)]",
  progress:
    "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-[#12333a] dark:text-teal-300 dark:ring-teal-800",
};

export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status?: string;
  label?: string;
  tone?: StatusTone;
  className?: string;
}) {
  const preset = status ? MAP[status.toLowerCase()] : undefined;
  const resolvedTone = tone ?? preset?.tone ?? "neutral";
  const resolvedLabel = label ?? preset?.label ?? status ?? "Unknown";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[resolvedTone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {resolvedLabel}
    </span>
  );
}
