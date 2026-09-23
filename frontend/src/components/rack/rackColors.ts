/**
 * The one place a rack occupancy status is turned into a colour.
 *
 * Both renderers read from here — the Tailwind side (`features/rack-locator/
 * components/trayStyles.ts`, which builds class names) and the SVG side
 * (`RackIllustration`, which needs raw paint values). Add a tier here
 * and every tile, pill, legend swatch and drawn tray moves together.
 *
 * Values are `var(--token)` strings rather than hex, so the drawings follow the
 * light/dark theme exactly like the rest of the UI: SVG `fill` / `stroke`
 * resolve CSS custom properties from the element's own cascade.
 *
 * The scale mirrors the backend's `RackState`
 * (`services/rack/app/topology.py::_rack_state`):
 *
 *   empty (0%) | available (<50%) | filling (50-84%) | nearly_full (85-99%) | full (100%)
 *
 * `empty` is a true blue, never teal — teal (`--color-primary`) means
 * "selected", and an empty tray must never be mistaken for a chosen one.
 */

export type RackTone = "empty" | "available" | "filling" | "nearly_full" | "full";

/** `disabled` is not an occupancy state — it is a rack that isn't in service. */
export type RackIconStatus = RackTone | "disabled";

export interface RackTonePaint {
  label: string;
  /** the tone itself — tray fill, pill text, progress bar */
  color: string;
  /** the tone at surface strength — tile and pill backgrounds */
  bg: string;
}

export const RACK_TONE: Record<RackTone, RackTonePaint> = {
  empty: { label: "Empty", color: "var(--color-empty)", bg: "var(--color-empty-bg)" },
  available: {
    label: "Available",
    color: "var(--color-success)",
    bg: "var(--color-success-bg)",
  },
  filling: {
    label: "Filling",
    color: "var(--color-warning)",
    bg: "var(--color-warning-bg)",
  },
  nearly_full: {
    label: "Nearly Full",
    color: "var(--color-orange)",
    bg: "var(--color-orange-bg)",
  },
  full: { label: "Full", color: "var(--color-danger)", bg: "var(--color-danger-bg)" },
};

/** Free -> full, the order every legend and stacked bar reads in. */
export const RACK_TONES: RackTone[] = [
  "empty",
  "available",
  "filling",
  "nearly_full",
  "full",
];

/** A rack that isn't in service: no tone, drawn greyscale and faded. */
export const DISABLED_PAINT: RackTonePaint = {
  label: "Out of service",
  color: "var(--color-text-muted)",
  bg: "var(--color-surface-2)",
};

export function paintFor(status: RackIconStatus): RackTonePaint {
  return status === "disabled" ? DISABLED_PAINT : RACK_TONE[status];
}

/**
 * The steel a drawn rack frame is made of, bound to the `--color-rack-*`
 * tokens rather than hard-coded slate so any such drawing has the same
 * light/dark behaviour as every border and surface on the page.
 */
export const RACK_FRAME = {
  upright: "var(--color-rack-upright)",
  beam: "var(--color-rack-beam)",
  /** the bay behind the trays */
  bay: "var(--color-surface-2)",
  /** the warm inspection lamps in the top frame */
  lamp: "var(--color-rack-lamp)",
  primary: "var(--color-primary)",
  primaryFg: "var(--color-primary-fg)",
  text: "var(--color-text)",
  textMuted: "var(--color-text-muted)",
  border: "var(--color-border)",
  borderStrong: "var(--color-border-strong)",
} as const;

/** `color-mix` lets a tone act as a border or wash without a second token. */
export function mix(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

/**
 * The same free->full bucketing the backend applies, for the many places that
 * carry only a percentage (a shelf, a card thumbnail) and not a full state.
 */
export function toneForFillPercent(fillPercent: number): RackTone {
  if (fillPercent >= 100) return "full";
  if (fillPercent >= 85) return "nearly_full";
  if (fillPercent >= 50) return "filling";
  if (fillPercent > 0) return "available";
  return "empty";
}

/**
 * The steel of the drawn rack illustration. Fixed industrial gunmetal: the
 * frame is the same in every occupancy state, only the bins are tinted.
 */
export const RACK_STEEL = {
  front: "var(--rack-steel-front)",
  back: "var(--rack-steel-back)",
  beam: "var(--rack-beam)",
  beamTop: "var(--rack-beam-top)",
  lid: "var(--rack-lid)",
  lidStrip: "var(--rack-bin-body)",
} as const;

export interface BinPaint {
  body: string;
  lip: string;
  /** the darker front-face shadow and receding side */
  shade: string;
  label: string;
}

/**
 * The paint for a rack's bins. An empty rack keeps the stock blue bins (a
 * disabled one too; it is drawn greyscale on top). Every other state tints the
 * bins from `RACK_TONE`, the same colour its % pill uses.
 */
export function binPaintFor(status: RackIconStatus): BinPaint {
  if (status === "empty" || status === "disabled") {
    return {
      body: "var(--rack-bin-body)",
      lip: "var(--rack-bin-lip)",
      shade: "var(--rack-bin-shade)",
      label: "var(--rack-bin-label)",
    };
  }
  const c = RACK_TONE[status].color;
  return {
    body: c,
    lip: `color-mix(in srgb, ${c} 65%, white)`,
    shade: `color-mix(in srgb, ${c} 75%, black)`,
    label: `color-mix(in srgb, ${c} 40%, white)`,
  };
}
