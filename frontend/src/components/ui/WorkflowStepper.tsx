import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type Step = { key: string; label: string };
export type StepState = "done" | "current" | "upcoming" | "blocked";

export function WorkflowStepper({
  steps,
  states,
  orientation = "horizontal",
}: {
  steps: Step[];
  states: Record<string, StepState>;
  orientation?: "horizontal" | "vertical";
}) {
  const vertical = orientation === "vertical";
  return (
    <ol className={cn("flex", vertical ? "flex-col gap-0" : "items-center gap-0 overflow-x-auto")}>
      {steps.map((s, i) => {
        const state = states[s.key] ?? "upcoming";
        const last = i === steps.length - 1;
        return (
          <li key={s.key} className={cn("flex", vertical ? "gap-3" : "flex-1 items-center gap-2")}>
            <div className={cn("flex items-center", vertical && "flex-col")}>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  state === "done" && "border-primary bg-primary text-[var(--color-primary-fg)]",
                  state === "current" &&
                    "border-primary text-primary ring-4 ring-[color-mix(in_srgb,var(--color-primary)_18%,transparent)]",
                  state === "upcoming" && "border-border-strong bg-surface text-text-muted",
                  state === "blocked" &&
                    "border-[var(--color-warning)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
                )}
              >
                {state === "done" ? <Check className="size-3.5" /> : i + 1}
              </span>
              {!last ? (
                <span
                  className={cn(
                    vertical ? "my-1 w-px flex-1 self-center" : "h-px flex-1",
                    state === "done" ? "bg-primary" : "bg-border-strong",
                    vertical ? "min-h-6" : "min-w-6",
                  )}
                />
              ) : null}
            </div>
            <span
              className={cn(
                "whitespace-nowrap text-xs",
                vertical ? "pb-4 pt-1" : "pr-2",
                state === "current" ? "font-semibold text-text" : "text-text-secondary",
              )}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
