"use client";

import { useEffect, useRef, useState } from "react";

/** How long a count takes to travel from its old value to its new one. */
const DURATION_MS = 600;

/**
 * A count that moves to its new value instead of snapping to it, so a change
 * arriving on a poll tick is visible without the user watching for it. Decorative
 * only — the settled value is announced separately (see FlowNode), and with
 * reduced motion the number changes in one step.
 */
export function CountTicker({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      shownRef.current = value;
      setShown(value);
      return;
    }

    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / DURATION_MS);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(from + (value - from) * eased);
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return <>{shown.toLocaleString()}</>;
}
