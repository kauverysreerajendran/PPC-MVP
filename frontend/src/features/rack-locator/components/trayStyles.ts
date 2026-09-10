import type { RackState, SlotState } from "../types";

/**
 * One place for the storage-status colours, so the rack, the mini rack on a
 * card and the legend can never drift apart.
 *
 * Colour is load-bearing here and used nowhere else: teal means "you may put
 * something here", neutral grey means "taken". Everything decorative stays
 * greyscale.
 */
export const TRAY_STATE: Record<
  SlotState,
  { className: string; label: string; swatch: string }
> = {
  empty: {
    className:
      "border-teal-300 bg-teal-50 text-teal-800 hover:border-teal-500 hover:bg-teal-100 dark:border-teal-700 dark:bg-[#12333a] dark:text-teal-200 dark:hover:border-teal-500",
    label: "Empty",
    swatch: "border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-[#12333a]",
  },
  occupied: {
    // deliberately desaturated: a full tray is context, not a call to action
    className:
      "cursor-default border-border-strong bg-[color-mix(in_srgb,var(--color-text-muted)_22%,var(--color-surface))] text-text-secondary dark:bg-[#243239]",
    label: "Occupied",
    swatch:
      "border-border-strong bg-[color-mix(in_srgb,var(--color-text-muted)_22%,var(--color-surface))] dark:bg-[#243239]",
  },
  reserved: {
    className:
      "border-[color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
    label: "Reserved",
    swatch:
      "border-[color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[var(--color-warning-bg)]",
  },
  blocked: {
    className:
      "border-border-strong bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--color-border)_3px,var(--color-border)_5px)] text-text-muted cursor-not-allowed",
    label: "Blocked",
    swatch:
      "border-border-strong bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--color-border)_3px,var(--color-border)_5px)]",
  },
};

export const TRAY_LEGEND: SlotState[] = ["occupied", "empty", "reserved", "blocked"];

export const RACK_STATE: Record<
  RackState,
  { label: string; tone: "neutral" | "success" | "info" | "warning" | "danger" }
> = {
  empty: { label: "Empty", tone: "info" },
  available: { label: "Available", tone: "success" },
  filling: { label: "Filling", tone: "info" },
  nearly_full: { label: "Nearly Full", tone: "warning" },
  full: { label: "Full", tone: "danger" },
};

/** `1,234` — thousands separators keep large tray counts readable. */
export function num(n: number): string {
  return n.toLocaleString();
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}
