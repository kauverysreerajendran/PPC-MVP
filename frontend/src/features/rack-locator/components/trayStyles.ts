import type { RackState, SlotState } from "../types";

/**
 * The single place tray colour is decided. Add a status here and every tray,
 * legend swatch and summary badge that uses it updates together — nothing in
 * the render tree hardcodes a colour.
 *
 * Colour is load-bearing and used nowhere decorative: mint = "you may store
 * here", muted grey = "taken", amber = "held", hatched = "blocked", strong
 * teal = "this is the one you picked".
 */
export const TRAY_STATE: Record<
  SlotState,
  { className: string; label: string; swatch: string }
> = {
  empty: {
    className:
      "border-teal-300 bg-teal-100 text-teal-800 hover:border-teal-500 hover:bg-teal-200 dark:border-teal-700 dark:bg-[#123c43] dark:text-teal-100 dark:hover:border-teal-500",
    label: "Empty Tray",
    swatch: "border-teal-300 bg-teal-100 dark:border-teal-700 dark:bg-[#123c43]",
  },
  occupied: {
    className:
      "cursor-default border-border-strong bg-surface-2 text-text-muted dark:bg-[#243239]",
    label: "Occupied Tray",
    swatch: "border-border-strong bg-surface-2 dark:bg-[#243239]",
  },
  reserved: {
    className:
      "border-[color-mix(in_srgb,var(--color-warning)_45%,transparent)] bg-[var(--color-warning-bg)] text-[var(--color-warning)] hover:border-[var(--color-warning)]",
    label: "Reserved Tray",
    swatch:
      "border-[color-mix(in_srgb,var(--color-warning)_45%,transparent)] bg-[var(--color-warning-bg)]",
  },
  blocked: {
    className:
      "cursor-not-allowed border-border-strong bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--color-border)_3px,var(--color-border)_5px)] text-text-muted",
    label: "Blocked Tray",
    swatch:
      "border-border-strong bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--color-border)_3px,var(--color-border)_5px)]",
  },
};

/** Strong teal — the tray the user has chosen. */
export const SELECTED_TRAY = {
  className:
    "border-primary bg-primary text-[var(--color-primary-fg)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-primary)_35%,transparent)]",
  swatch: "border-primary bg-primary",
  label: "Selected Tray",
};

export const TRAY_LEGEND: SlotState[] = ["occupied", "empty", "reserved", "blocked"];

/**
 * Rack fill scale — free reads green through to full reading red, same light
 * palette as everywhere else in the app: free = success (green), half filled
 * = warning (yellow), partial/nearly full = orange, fully filled = danger
 * (red). Tray-level "occupied" (an individual slot that's taken) is a
 * separate, unrelated grey in `TRAY_STATE` and is untouched by this scale.
 */
export const RACK_STATE: Record<
  RackState,
  { label: string; tone: "neutral" | "success" | "info" | "warning" | "orange" | "danger" }
> = {
  empty: { label: "Empty", tone: "success" },
  available: { label: "Available", tone: "success" },
  filling: { label: "Filling", tone: "warning" },
  nearly_full: { label: "Nearly Full", tone: "orange" },
  full: { label: "Full", tone: "danger" },
};

export const TONE_TEXT = {
  neutral: "text-text-secondary",
  success: "text-[var(--color-success)]",
  info: "text-[var(--color-info)]",
  warning: "text-[var(--color-warning)]",
  orange: "text-[var(--color-orange)]",
  danger: "text-[var(--color-danger)]",
} as const;

/** Light pastel fill — the bar/chip background for each rack fill tone. */
export const TONE_BG = {
  neutral: "bg-[var(--color-surface-2)]",
  success: "bg-[var(--color-success-bg)]",
  info: "bg-[var(--color-info-bg)]",
  warning: "bg-[var(--color-warning-bg)]",
  orange: "bg-[var(--color-orange-bg)]",
  danger: "bg-[var(--color-danger-bg)]",
} as const;

/** Solid version of the same tone — used for the filled portion of a bar. */
export const TONE_FILL = {
  neutral: "bg-text-muted",
  success: "bg-[var(--color-success)]",
  info: "bg-[var(--color-info)]",
  warning: "bg-[var(--color-warning)]",
  orange: "bg-[var(--color-orange)]",
  danger: "bg-[var(--color-danger)]",
} as const;

/**
 * Same free→full colour bucketing the backend uses for `rack.state`
 * (`services/rack/app/topology.py::_rack_state`), applied to a bare
 * percentage — for spots (like a shelf's mini elevation bar) that only carry
 * an occupancy_pct, not a full state.
 */
export function toneForOccupancyPct(occupancyPct: number): keyof typeof TONE_FILL {
  if (occupancyPct >= 100) return "danger";
  if (occupancyPct >= 85) return "orange";
  if (occupancyPct >= 50) return "warning";
  return "success";
}

/** `1,234` — thousands separators keep large tray counts readable. */
export function num(n: number): string {
  return n.toLocaleString();
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

/** Front / Middle / Back — a human name for a vertical row position. */
export function rowPositionLabel(rowNo: number, rowCount: number): string {
  if (rowCount <= 1) return "";
  if (rowNo === 1) return "Front";
  if (rowNo === rowCount) return "Back";
  // only an odd row count has a single true middle; even counts stay unlabelled
  if (rowCount % 2 === 1 && rowNo === (rowCount + 1) / 2) return "Middle";
  return "";
}
