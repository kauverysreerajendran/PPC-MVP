"use client";

import { Check, CircleDashed } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import type { TimelineStep } from "../timeline";

const STATE_TEXT = {
  done: "done",
  current: "current stage",
  skipped: "not done — a later stage was reached",
  upcoming: "not reached",
} as const;

function when(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Dispatched → Received → Verified → Placed as a stepper: horizontal from
 * `sm`, vertical below. The current stage is emphasised, later ones muted;
 * each step also says its state in words (badge + screen-reader text), never
 * by colour alone.
 */
export function StageTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:gap-0">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const reached = s.state === "done" || s.state === "current";
        const nextReached = !last && (steps[i + 1]!.state === "done" || steps[i + 1]!.state === "current");
        return (
          <li
            key={s.key}
            aria-current={s.state === "current" ? "step" : undefined}
            className="relative flex min-w-0 flex-1 gap-3 sm:flex-col sm:gap-2"
          >
            {/* connector to the next step */}
            {!last ? (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[13px] top-7 h-[calc(100%-4px)] w-px sm:left-7 sm:right-0 sm:top-[13px] sm:h-px sm:w-auto",
                  nextReached ? "bg-primary" : "bg-border-strong",
                )}
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative z-[1] flex size-[27px] shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                s.state === "done" && "border-primary bg-primary text-white",
                s.state === "current" &&
                  (s.partial
                    ? "border-[var(--color-orange)] bg-[var(--color-orange-bg)] text-[var(--color-orange)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-orange)_14%,transparent)]"
                    : "border-primary bg-primary text-white shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_16%,transparent)]"),
                s.state === "upcoming" && "border-border-strong bg-surface text-text-muted",
                s.state === "skipped" && "border-dashed border-[var(--color-warning)] bg-surface text-[var(--color-warning)]",
              )}
            >
              {s.state === "upcoming" || s.state === "skipped" ? (
                i + 1
              ) : s.partial ? (
                <CircleDashed className="size-3.5" />
              ) : (
                <Check className="size-3.5" strokeWidth={3} />
              )}
            </span>
            <div className={cn("min-w-0 pb-1 sm:pr-3", s.state === "upcoming" && "opacity-60")}>
              <p
                className={cn(
                  "text-xs",
                  s.state === "current" ? "font-semibold text-text" : "font-medium text-text-secondary",
                )}
              >
                {s.title}
                <span className="sr-only"> — {STATE_TEXT[s.state]}</span>
              </p>
              <StatusBadge label={s.label} tone={s.tone} className="mt-1 max-w-full text-[11px]" />
              <p className="mt-1 text-[10px] tabular-nums text-text-muted">
                {s.state === "skipped"
                  ? "skipped"
                  : (when(s.at) ?? (reached ? "time not recorded" : "\u00a0"))}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
