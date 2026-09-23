"use client";

import { type CSSProperties, useId } from "react";
import { cn } from "@/lib/cn";
import {
  RACK_STEEL,
  type RackIconStatus,
  binPaintFor,
  toneForFillPercent,
} from "./rackColors";

/**
 * An industrial steel shelving unit seen from the front at a slight 3/4 turn:
 * gunmetal uprights, a grey beam per level, a light lid on top, and a row of
 * open-front bins on every shelf.
 *
 * The frame never changes colour. Only the bins are tinted, through
 * `binPaintFor` — the same status map the rack card's % pill reads — and an
 * empty rack keeps the stock blue bins.
 *
 * Bins are one `<symbol>` repeated with `<use>`; their paint arrives as CSS
 * custom properties set on the root `<svg>`, which inherit into every `<use>`
 * instance. Ids come from `useId()`, so any number of racks can share a page
 * without their defs clashing.
 */

/* ---- geometry, in viewBox units (0 0 120 100) ----------------------------- */

/** The back of the rack sits this far right and up — the 3/4 turn. */
const DX = 8;
const DY = -5;
const LEFT = 12;
const RIGHT = 98;
const POST = 4;
/** Top of the front frame (under the lid) and the floor line. */
const TOP = 19;
const FLOOR = 88;
const BEAM = 2.4;
const LID = 3;
/** How much of its width each bin gives up to the one beside it. */
const OVERLAP = 0.9;

export function RackIllustration({
  levels = 5,
  binsPerLevel = 5,
  fillPercent = 0,
  status,
  size,
  label,
  className,
}: {
  /** Shelves in the rack, clamped to 1-8. */
  levels?: number;
  /** Bins drawn on each shelf, clamped to 1-8. */
  binsPerLevel?: number;
  /** 0-100. Decides the tint when `status` is not given. */
  fillPercent?: number;
  /** The rack's own state, when the caller has one. Overrides `fillPercent`. */
  status?: RackIconStatus | undefined;
  /** Rendered width in px; omitted, the drawing fills its container. */
  size?: number | undefined;
  /** e.g. "Rack A-A1, 0% filled". Omit inside an already-labelled control. */
  label?: string | undefined;
  className?: string | undefined;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const binId = `rack-bin-${uid}`;
  const blurId = `rack-blur-${uid}`;

  const n = clamp(levels);
  const bins = clamp(binsPerLevel);
  const disabled = status === "disabled";
  const paint = binPaintFor(status ?? toneForFillPercent(fillPercent));

  const bayTop = TOP + LID + 0.5;
  const bayBottom = FLOOR - 3;
  const levelH = (bayBottom - bayTop) / n;
  const binH = Math.max(2, levelH - BEAM - 1.2);

  // Bins shrink a little toward the right to follow the perspective and each
  // overlaps the next; the whole row is then scaled to fit between the posts.
  const innerL = LEFT + POST + 0.5;
  const innerR = RIGHT - POST - 0.5;
  const rel = Array.from({ length: bins }, (_, j) => 1 - 0.04 * j);
  const span = rel.reduce((s, r, j) => s + r * (j === bins - 1 ? 1 : OVERLAP), 0);
  const unit = (innerR - innerL) / span;
  const slots = rel.map((r, j) => ({
    x: innerL + rel.slice(0, j).reduce((s, q) => s + q * unit * OVERLAP, 0),
    w: r * unit,
    h: binH * (0.9 + 0.1 * r),
  }));

  return (
    <svg
      viewBox="0 0 120 100"
      width={size ?? "100%"}
      height={size ? undefined : "100%"}
      preserveAspectRatio="xMidYMid meet"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={cn("block", disabled && "opacity-40 grayscale", className)}
      style={
        {
          "--bin-body": paint.body,
          "--bin-lip": paint.lip,
          "--bin-shade": paint.shade,
          "--bin-label": paint.label,
        } as CSSProperties
      }
    >
      <defs>
        <filter id={blurId} x="-20%" y="-300%" width="140%" height="700%">
          <feGaussianBlur stdDeviation="1.8" />
        </filter>
        {/* one open-front bin: lip on top, side receding right, a shadowed
            scoop where the front is cut away, and a label plate */}
        <symbol id={binId} viewBox="0 0 22 14" preserveAspectRatio="none">
          <polygon points="0,3 3,0 22,0 19,3" fill="var(--bin-lip)" />
          <polygon points="19,3 22,0 22,11 19,14" fill="var(--bin-shade)" />
          <rect x="0" y="3" width="19" height="11" fill="var(--bin-body)" />
          <polygon points="1.2,3.6 17.8,3.6 17.8,5.4 1.2,7.2" fill="var(--bin-shade)" />
          <rect x="6" y="8.6" width="7" height="3.2" rx="0.6" fill="var(--bin-label)" />
        </symbol>
      </defs>

      {/* ground shadow */}
      <ellipse
        cx="58"
        cy="91"
        rx="50"
        ry="3.5"
        fill="#000"
        opacity="0.08"
        filter={`url(#${blurId})`}
      />

      {/* back uprights and the right-hand side panel that gives the rack depth */}
      <rect
        x={LEFT + DX}
        y={TOP + DY}
        width={POST - 1}
        height={FLOOR - TOP}
        fill={RACK_STEEL.back}
      />
      <rect
        x={RIGHT - POST + DX + 1}
        y={TOP + DY}
        width={POST - 1}
        height={FLOOR - TOP}
        fill={RACK_STEEL.back}
      />
      <polygon
        points={`${RIGHT},${TOP} ${RIGHT + DX},${TOP + DY} ${RIGHT + DX},${FLOOR + DY} ${RIGHT},${FLOOR}`}
        fill={RACK_STEEL.back}
        opacity={0.3}
      />

      {/* shelves, top first: the beam's lit top face, the bins on it, the beam front */}
      {Array.from({ length: n }, (_, i) => {
        const beamY = bayTop + (i + 1) * levelH - BEAM;
        return (
          <g key={i}>
            <polygon
              points={`${LEFT},${beamY} ${LEFT + DX},${beamY + DY} ${RIGHT + DX},${beamY + DY} ${RIGHT},${beamY}`}
              fill={RACK_STEEL.beamTop}
              opacity={0.5}
            />
            {/* right to left, so the nearer, larger bins overlap the far ones */}
            {slots
              .map((s, j) => (
                <use
                  key={j}
                  href={`#${binId}`}
                  x={s.x}
                  y={beamY - s.h + 0.3}
                  width={s.w}
                  height={s.h}
                />
              ))
              .reverse()}
            <rect x={LEFT} y={beamY} width={RIGHT - LEFT} height={BEAM} fill={RACK_STEEL.beam} />
            <rect
              x={LEFT}
              y={beamY}
              width={RIGHT - LEFT}
              height={0.6}
              fill={RACK_STEEL.beamTop}
            />
          </g>
        );
      })}

      {/* lid: top face, front edge and the thin blue strip */}
      <polygon
        points={`${LEFT - 1.5},${TOP} ${LEFT - 1.5 + DX},${TOP + DY} ${RIGHT + 1.5 + DX},${TOP + DY} ${RIGHT + 1.5},${TOP}`}
        fill={RACK_STEEL.lid}
      />
      <rect x={LEFT - 1.5} y={TOP} width={RIGHT - LEFT + 3} height={LID} fill={RACK_STEEL.lid} />
      <rect
        x={LEFT - 1.5}
        y={TOP + LID - 1}
        width={RIGHT - LEFT + 3}
        height={1}
        fill={RACK_STEEL.lidStrip}
      />

      {/* front uprights last, so the posts sit in front of the bins, with feet */}
      {[LEFT, RIGHT - POST].map((x) => (
        <g key={x}>
          <rect
            x={x}
            y={TOP + LID}
            width={POST}
            height={FLOOR - TOP - LID}
            fill={RACK_STEEL.front}
          />
          <rect
            x={x + POST - 1}
            y={TOP + LID}
            width={1}
            height={FLOOR - TOP - LID}
            fill={RACK_STEEL.back}
          />
          <rect
            x={x - 1.2}
            y={FLOOR - 1}
            width={POST + 2.4}
            height={2}
            rx={0.6}
            fill={RACK_STEEL.back}
          />
        </g>
      ))}
    </svg>
  );
}

function clamp(v: number) {
  return Math.max(1, Math.min(8, Math.round(v)));
}
