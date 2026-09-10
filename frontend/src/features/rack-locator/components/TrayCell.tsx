"use client";

import { cn } from "@/lib/cn";
import type { Tray } from "../types";
import { TRAY_STATE } from "./trayStyles";

/**
 * One physical tray. The smallest unit of the whole hierarchy and the only
 * thing on the page the user actually clicks.
 */
export function TrayCell({
  tray,
  selected,
  recommendedRank,
  onSelect,
}: {
  tray: Tray;
  selected: boolean;
  recommendedRank?: number | undefined;
  onSelect: (tray: Tray) => void;
}) {
  const style = TRAY_STATE[tray.state];
  const selectable = tray.state === "empty" || tray.state === "reserved";
  const title =
    tray.state === "occupied"
      ? `${tray.code} — ${tray.occupied_by_model ?? "occupied"}`
      : `${tray.code} — ${style.label}`;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={selected}
      disabled={!selectable && tray.state !== "occupied"}
      onClick={() => onSelect(tray)}
      className={cn(
        "ds-focus-ring relative flex h-[22px] w-[26px] shrink-0 items-center justify-center rounded-[var(--radius-xs)]",
        "border text-[9px] font-medium tabular-nums transition-all duration-150",
        style.className,
        selectable && "cursor-pointer",
        // the recommendation the backend ranked first, before anything is picked
        recommendedRank === 1 &&
          !selected &&
          "border-teal-500 shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-primary)_22%,transparent)]",
        selected &&
          "z-10 -translate-y-px border-primary bg-teal-100 text-teal-900 shadow-[0_0_0_2px_var(--color-primary)] dark:bg-[#164e57] dark:text-teal-50",
      )}
    >
      {String(tray.tray_no).padStart(2, "0")}
      {recommendedRank && recommendedRank > 1 ? (
        <span
          className="absolute -right-1 -top-1 flex size-3 items-center justify-center rounded-full bg-primary text-[7px] font-semibold text-[var(--color-primary-fg)]"
          aria-hidden
        >
          {recommendedRank}
        </span>
      ) : null}
    </button>
  );
}
