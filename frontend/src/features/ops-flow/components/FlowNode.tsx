import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

/** Entrance stagger between one card and the next. */
const ENTRANCE_STEP_MS = 60;

/**
 * One step of the process. The whole card is the link — the anchor's ::after
 * covers it, see `.ops-flow-node-link` — so the card is a single control rather
 * than a link with other clickable things inside it.
 */
export function FlowNode({
  step,
  title,
  detail,
  icon,
  href,
}: {
  /** 0-based position, which is also this node's slot in the walk schedule. */
  step: number;
  title: string;
  detail: string;
  icon: ReactNode;
  href: string;
}) {
  return (
    <div
      className="ops-flow-node ds-animate-fade-up"
      style={
        {
          "--ops-flow-step": String(step),
          animationDelay: `${step * ENTRANCE_STEP_MS}ms`,
        } as CSSProperties
      }
    >
      <span className="ops-flow-node-sweep" aria-hidden />

      <div className="flex items-center justify-between gap-2">
        <span className="ops-flow-node-icon" aria-hidden>
          {icon}
        </span>
        <span className="ops-flow-node-step" aria-hidden>
          {step + 1}
        </span>
      </div>

      <Link
        href={href}
        aria-label={`Step ${step + 1}: ${title}`}
        className="ops-flow-node-link ds-focus-ring mt-3 block text-sm font-semibold text-text"
      >
        {title}
      </Link>

      <p className="mt-1 text-xs leading-relaxed text-text-secondary">{detail}</p>
    </div>
  );
}
