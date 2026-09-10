"use client";

import { useEffect, useState } from "react";

type Opts = {
  /** minimum rows per page (default 10) */
  base?: number;
  /** approximate rendered height of one table row in px */
  rowHeight?: number;
  /** vertical space taken by page chrome (header, toolbar, footer, nav) */
  reserved?: number;
  /** hard cap on rows per page */
  max?: number;
};

/**
 * Rows-per-page that adapts to the viewport: never below `base` (10), grows to
 * whatever the current window height can show, capped at `max`. Re-computes on
 * resize / orientation change so every breakpoint gets a sensible page.
 */
export function usePageSize({
  base = 10,
  rowHeight = 45,
  reserved = 340,
  max = 60,
}: Opts = {}): number {
  const [size, setSize] = useState(base);

  useEffect(() => {
    const calc = () => {
      const fit = Math.floor((window.innerHeight - reserved) / rowHeight);
      setSize(Math.max(base, Math.min(max, Number.isFinite(fit) ? fit : base)));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [base, rowHeight, reserved, max]);

  return size;
}
