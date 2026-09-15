"use client";

import { cn } from "@/lib/cn";
import type { Tray } from "../types";
import { SELECTED_TRAY, TRAY_STATE } from "./trayStyles";

/**
 * One physical tray. The smallest unit of the hierarchy and the only thing on
 * the page the user actually clicks. Sizes itself to its grid column so a shelf
 * of 12 trays and a shelf of 15 both fill the same width.
 */
export function TrayCell({
  tray,
  selected,
  recommendedRank,
  onSelect,
  pickerMode,
}: {
  tray: Tray;
  selected: boolean;
  recommendedRank?: number | undefined;
  onSelect: (tray: Tray) => void;
  /** Placement tray picker: only empty/reserved trays are pickable — occupied
   * and blocked trays are disabled outright with a reason, never a silent
   * no-op click. */
  pickerMode?: boolean | undefined;
}) {
  const style = selected ? SELECTED_TRAY : TRAY_STATE[tray.state];
  const selectable = tray.state === "empty" || tray.state === "reserved";
  const title =
    tray.state === "occupied"
      ? pickerMode
        ? `${tray.code} — occupied by ${tray.occupied_by_model ?? "another model"}`
        : [
            tray.code,
            tray.occupied_by_model ?? "occupied",
            tray.lot_no,
            tray.qty != null ? `qty ${tray.qty}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
      : `${tray.code} — ${TRAY_STATE[tray.state].label}`;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={selected}
      disabled={pickerMode ? !selectable : !selectable && tray.state !== "occupied"}
      onClick={() => onSelect(tray)}
      className={cn(
        "ds-focus-ring relative flex aspect-square min-w-0 items-center justify-center rounded-[var(--radius-xs)]",
        "border text-[10px] font-medium tabular-nums transition-all duration-150",
        style.className,
        selectable && !selected && "cursor-pointer",
        // the backend's #1 pick, flagged before the user has chosen anything
        recommendedRank === 1 &&
          !selected &&
          "border-primary shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-primary)_22%,transparent)]",
        selected && "z-10",
      )}
    >
      {String(tray.tray_no).padStart(2, "0")}
      {recommendedRank && recommendedRank > 1 && !selected ? (
        <span
          className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-semibold text-[var(--color-primary-fg)]"
          aria-hidden
        >
          {recommendedRank}
        </span>
      ) : null}
    </button>
  );
}
