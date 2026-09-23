"use client";

import { AlertTriangle, Check, Info, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { ChosenTray } from "../../types";

/**
 * The placement bar at the bottom of the Rack Locator in placement mode.
 *
 * Three regions, left to right: where you are (the tray you last clicked, and
 * how full that column already is), how many trays this click should take,
 * and the one primary action — disabled from click until the response is
 * handled (docs/08 §1.2).
 *
 * The stepper is a *run* control, not a quantity: raising it takes the next
 * free trays going up the selected column, lowering it gives them back. One
 * chip per chosen tray, carrying the qty allocated to it — a tray holds up to
 * its capacity, so the last one is usually partial — and the chips stay the
 * way to drop a tray picked in some other column.
 *
 * Confirm is only enabled when the request it sends is one the rack service
 * accepts; otherwise the reason sits next to it. A confirm that failed leaves
 * its message here too (danger tone) until the trays change.
 */
export function ConfirmBar({
  chosen,
  qtyForTray,
  onRemove,
  selection,
  count,
  max,
  onCountChange,
  total,
  sendCount,
  blockReason,
  notice,
  unneededCount,
  onDropUnneeded,
  disabled,
  pending,
  onConfirm,
}: {
  /** the trays chosen so far, in order */
  chosen: ChosenTray[];
  /** qty allocated to the tray at `index` */
  qtyForTray: (index: number) => number;
  onRemove: (index: number) => void;
  /** the tray last clicked, with its column's occupancy as the service sent it */
  selection: { shelfNo: number; rowNo: number; occupied: number; capacity: number } | null;
  /** trays currently taken in that column, as one consecutive run */
  count: number;
  /** clamped to the trays the qty fills and the free trays above the run */
  max: number;
  onCountChange: (next: number) => void;
  /** qty the confirm places — the sum of the trays that take something */
  total: number;
  /** trays the confirm sends */
  sendCount: number;
  /** why Confirm is disabled, or null */
  blockReason: string | null;
  /** why the last confirm failed, until the trays change */
  notice: string | null;
  /** chosen trays the remaining qty does not reach */
  unneededCount: number;
  onDropUnneeded: () => void;
  disabled: boolean;
  pending: boolean;
  onConfirm: () => void;
}) {
  const trays = sendCount;
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 space-y-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-[var(--radius-lg)] sm:border sm:shadow-[var(--shadow-sm)]">
      {trays > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {chosen.map((c, i) => {
            const qty = qtyForTray(i);
            const idle = qty <= 0;
            return (
              <li
                key={c.code}
                title={idle ? `Tray ${i + 1} · not needed` : `Tray ${i + 1} · ${qty} qty`}
                className={cn(
                  "flex items-center gap-2 rounded-full border py-1 pl-1.5 pr-1 text-xs",
                  idle
                    ? "border-dashed border-[var(--color-warning)] bg-[var(--color-warning-bg)]"
                    : "border-border bg-surface-2",
                )}
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-[var(--color-primary-fg)]">
                  {i + 1}
                </span>
                <span className="font-medium tabular-nums text-text">
                  {c.code}
                  {idle ? (
                    <span className="ml-1 font-normal text-[var(--color-warning)]">· not needed</span>
                  ) : (
                    <span className="ml-1 font-normal text-text-secondary">· {qty} qty</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  title={`Remove tray ${i + 1}`}
                  aria-label={`Remove tray ${c.code} from this placement`}
                  className="ds-focus-ring rounded-full p-0.5 text-text-muted hover:bg-surface hover:text-text"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {notice ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_30%,var(--color-border))] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-text"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-danger)]" />
          <span>{notice}</span>
        </p>
      ) : null}

      {blockReason && blockReason !== notice && trays + unneededCount > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary"
        >
          <span className="flex items-center gap-1.5">
            <Info className="size-4 shrink-0 text-[var(--color-warning)]" />
            {blockReason}
          </span>
          {unneededCount > 0 ? (
            <Button size="sm" variant="secondary" onClick={onDropUnneeded}>
              Drop {unneededCount} tray{unneededCount === 1 ? "" : "s"}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-[160px]">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Selected Location
          </p>
          {selection ? (
            <>
              <p className="text-sm font-semibold text-text">
                Shelf {selection.shelfNo} · Column {selection.rowNo}
              </p>
              <p className="text-xs tabular-nums text-text-secondary">
                Current: {selection.occupied} / {selection.capacity} trays
              </p>
            </>
          ) : (
            <p className="text-sm text-text-secondary">Click a tray in the rack</p>
          )}
        </div>

        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Trays here
          </p>
          <div className="flex items-center gap-1.5">
            <StepButton
              label="One tray fewer in this column"
              disabled={!selection || count <= 0}
              onClick={() => onCountChange(count - 1)}
            >
              <Minus className="size-4" />
            </StepButton>
            <span
              aria-live="polite"
              className="min-w-8 text-center text-base font-semibold tabular-nums text-text"
            >
              {count}
            </span>
            <StepButton
              label="One tray more in this column"
              disabled={!selection || count >= max}
              onClick={() => onCountChange(count + 1)}
            >
              <Plus className="size-4" />
            </StepButton>
          </div>
        </div>

        <Button
          size="lg"
          disabled={disabled}
          loading={pending}
          onClick={onConfirm}
          title={blockReason ?? undefined}
          className="min-w-[140px] flex-1 sm:flex-none"
        >
          <Check className="size-4" />
          Place {total.toLocaleString()} qty in {trays} tray{trays === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
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
        "ds-focus-ring flex size-8 items-center justify-center rounded-[var(--radius-sm)] border border-border-strong bg-surface text-text",
        "hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-45",
      )}
    >
      {children}
    </button>
  );
}
