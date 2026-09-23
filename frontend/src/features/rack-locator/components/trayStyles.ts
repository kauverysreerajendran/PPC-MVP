import { RACK_TONE, RACK_TONES, toneForFillPercent, type RackTone } from "@/components/rack";
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
      "border-[color-mix(in_srgb,var(--color-empty)_40%,transparent)] bg-[var(--color-empty-bg)] text-[var(--color-empty)] hover:border-[var(--color-empty)]",
    label: "Empty Tray",
    swatch:
      "border-[color-mix(in_srgb,var(--color-empty)_40%,transparent)] bg-[var(--color-empty-bg)]",
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

/**
 * The one occupancy scale used everywhere in Rack Locator — five distinct
 * colours, free to full, matching the backend's `RackState`
 * (`services/rack/app/topology.py::_rack_state`):
 *
 *   empty (0%) -> blue | available (<50%) -> green | filling (50-84%) -> yellow
 *   | nearly_full (85-99%) -> orange | full (100%) -> red
 *
 * `empty` is a genuine blue (`--color-empty`), not teal, so an empty tile
 * never reads as a selected/active one (selection uses `--color-primary`,
 * which is teal). Every rack tile, shelf pill, tray swatch and legend swatch
 * pulls from this table — nothing elsewhere hardcodes a tone.
 *
 * | state       | light text/fill | light bg  | dark text/fill | dark bg   |
 * |-------------|------------------|-----------|-----------------|-----------|
 * | empty       | #2563eb          | #e8f0fe   | #7aa2f7         | #16233f  |
 * | available   | #0f9d58          | #e7f6ee   | (same)          | (same)   |
 * | filling     | #b8860b          | #fdf4e3   | (same)          | (same)   |
 * | nearly_full | #c2670f          | #fbe9d8   | (same)          | (same)   |
 * | full        | #d64545          | #fdecec   | (same)          | (same)   |
 */
export type OccupancyTone = RackTone;

export const OCCUPANCY_SCALE: Record<
  OccupancyTone,
  { label: string; text: string; bg: string; fill: string; ring: string }
> = {
  empty: {
    label: RACK_TONE.empty.label,
    text: "text-[var(--color-empty)]",
    bg: "bg-[var(--color-empty-bg)]",
    fill: "bg-[var(--color-empty)]",
    ring: "ring-[color-mix(in_srgb,var(--color-empty)_35%,transparent)]",
  },
  available: {
    label: RACK_TONE.available.label,
    text: "text-[var(--color-success)]",
    bg: "bg-[var(--color-success-bg)]",
    fill: "bg-[var(--color-success)]",
    ring: "ring-[color-mix(in_srgb,var(--color-success)_35%,transparent)]",
  },
  filling: {
    label: RACK_TONE.filling.label,
    text: "text-[var(--color-warning)]",
    bg: "bg-[var(--color-warning-bg)]",
    fill: "bg-[var(--color-warning)]",
    ring: "ring-[color-mix(in_srgb,var(--color-warning)_35%,transparent)]",
  },
  nearly_full: {
    label: RACK_TONE.nearly_full.label,
    text: "text-[var(--color-orange)]",
    bg: "bg-[var(--color-orange-bg)]",
    fill: "bg-[var(--color-orange)]",
    ring: "ring-[color-mix(in_srgb,var(--color-orange)_35%,transparent)]",
  },
  full: {
    label: RACK_TONE.full.label,
    text: "text-[var(--color-danger)]",
    bg: "bg-[var(--color-danger-bg)]",
    fill: "bg-[var(--color-danger)]",
    ring: "ring-[color-mix(in_srgb,var(--color-danger)_35%,transparent)]",
  },
};

/** `rack.state` maps 1:1 onto the occupancy scale — same key, same tone. */
export const RACK_STATE: Record<RackState, { label: string; tone: OccupancyTone }> =
  Object.fromEntries(
    RACK_TONES.map((tone) => [tone, { label: RACK_TONE[tone].label, tone }]),
  ) as Record<RackState, { label: string; tone: OccupancyTone }>;

export const OCCUPANCY_LEGEND: OccupancyTone[] = RACK_TONES;

/**
 * Same free->full bucketing as `rack.state`, applied to a bare percentage —
 * for spots (a shelf's mini elevation bar, a shelf pill) that only carry an
 * `occupancy_pct`, not a full `RackState`.
 */
export const toneForOccupancyPct = toneForFillPercent;

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

/**
 * The matrix bars (`components/rack/RackMatrix`). Same states as `TRAY_STATE`,
 * drawn as thin horizontal bars rather than numbered boxes, so the cell has to
 * read at a glance from across an aisle: solid green = taken, pale grey =
 * free, and everything else deliberately quieter so those two carry the shape
 * of the column.
 */
export const TRAY_BAR: Record<SlotState, { className: string; label: string }> = {
  empty: {
    className:
      "bg-border-strong hover:bg-[color-mix(in_srgb,var(--color-empty)_60%,var(--color-border-strong))]",
    label: "Empty",
  },
  occupied: {
    className: "bg-[var(--color-success)]",
    label: "Filled (bottom to top)",
  },
  reserved: {
    className:
      "bg-[color-mix(in_srgb,var(--color-warning)_55%,var(--color-border-strong))] hover:bg-[var(--color-warning)]",
    label: "Reserved",
  },
  blocked: {
    className:
      "cursor-not-allowed bg-[repeating-linear-gradient(45deg,var(--color-surface-2),var(--color-surface-2)_2px,var(--color-border-strong)_2px,var(--color-border-strong)_4px)]",
    label: "Blocked",
  },
};

/** The bar the user has chosen — outlined rather than recoloured, so the
 * filled/empty read of the column survives the selection. */
export const SELECTED_BAR = {
  className: "bg-primary",
  label: "Selected",
};

/** A Locate Me suggestion that hasn't been taken yet. */
export const SUGGESTED_BAR = {
  className: "bg-primary",
  label: "Suggested (ranked)",
};

/** Filled and empty first — the two tones the matrix is really made of. */
export const TRAY_BAR_LEGEND: { className: string; label: string }[] = [
  TRAY_BAR.occupied,
  TRAY_BAR.empty,
  TRAY_BAR.reserved,
  TRAY_BAR.blocked,
  SELECTED_BAR,
  SUGGESTED_BAR,
];
