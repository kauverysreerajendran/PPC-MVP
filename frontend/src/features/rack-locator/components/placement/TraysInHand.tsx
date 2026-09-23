"use client";

import { Calculator, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { capacityExplainer, DEFAULT_TRAY_CAPACITY_QTY } from "../../trayCapacity";

/**
 * The tray half of the placement card's control row — "Trays in hand" and
 * what follows from it.
 *
 * The operator says how many trays they are physically holding — a seed, not
 * a cap: clicking more trays raises it, up to what the qty fills. The locator
 * asks the backend for exactly that many free trays, which "Accept all
 * suggestions" (beside the search) takes in one go — otherwise the operator
 * clicks each tray, or a column's "All empty". The
 * derivation beside it is live and in words, so the arithmetic that decides
 * the tray count is never hidden: qty ÷ capacity, remainder and all.
 */
export function TraysInHand({
  value,
  onChange,
  max,
  remainingQty,
  capacity = DEFAULT_TRAY_CAPACITY_QTY,
  freeTrays,
}: {
  value: number;
  onChange: (next: number) => void;
  /** trays the remaining qty fills — the stepper never goes past it */
  max: number;
  /** received qty still to place */
  remainingQty: number;
  capacity?: number;
  /** free trays the backend could find at all */
  freeTrays: number | null;
}) {
  const short = freeTrays != null && freeTrays < value;

  return (
    // fragments, not a box: these sit inline in the card's single control row
    <>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
          Trays in hand
        </span>
        <div className="flex items-center gap-1">
          <StepButton
            label="One tray fewer"
            disabled={value <= 1}
            onClick={() => onChange(value - 1)}
          >
            <Minus className="size-3.5" />
          </StepButton>
          <input
            type="text"
            inputMode="numeric"
            value={String(value)}
            aria-label="Trays in hand"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              if (digits === "") return;
              onChange(Number(digits));
            }}
            className="h-7 w-10 rounded-[var(--radius-sm)] border border-border-strong bg-surface text-center text-sm font-semibold tabular-nums text-text outline-none focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_28%,transparent)]"
          />
          <StepButton
            label="One tray more"
            disabled={value >= max}
            onClick={() => onChange(value + 1)}
          >
            <Plus className="size-3.5" />
          </StepButton>
        </div>
      </div>

      <div className="min-w-0">
        <p
          className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--color-primary)_20%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-primary)_6%,var(--color-surface))] px-3 py-1 text-sm tabular-nums text-text-secondary"
          aria-live="polite"
        >
          <Calculator className="size-3.5 shrink-0 text-primary" aria-hidden />
          {capacityExplainer(remainingQty, capacity)}
        </p>
      </div>

      {short ? (
        <p className="text-xs text-[var(--color-warning)]">
          Only {freeTrays} free tray{freeTrays === 1 ? "" : "s"} in this warehouse
        </p>
      ) : null}
    </>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "ds-focus-ring flex size-7 items-center justify-center rounded-[var(--radius-sm)] border border-border-strong bg-surface text-text",
        "hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-45",
      )}
    >
      {children}
    </button>
  );
}
