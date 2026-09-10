"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onApiActivity } from "@/lib/api/client";

/**
 * Global network buffering indicator.
 *
 * `RouteProgress` covers page navigation and hard refreshes; this covers the
 * data layer:
 *  - any in-flight API request → a thin indeterminate bar at the very top
 *  - a request stuck past `SLOW_REQUEST_MS` → a "network's crawling" mascot
 *    banner drops in from the top on a warm background (instead of a plain toast)
 */
const SHOW_DELAY_MS = 300; // don't flash the bar for quick requests

/** Rotating, deliberately un-corporate status lines for the slow banner. */
const SLOW_LINES = [
  "A snail kindly volunteered to carry your packets.",
  "Your bytes are stuck in traffic — honking won't help.",
  "Bribing the router with a few extra electrons…",
  "The data decided to take the scenic route.",
  "Buffering like it's on dial-up. *screech*",
  "Packets are doing breathing exercises. Almost there.",
];

function SnailMascot() {
  return (
    <svg
      viewBox="0 0 64 44"
      className="h-9 w-12 shrink-0 text-[var(--color-warning)]"
      fill="none"
      aria-hidden
    >
      {/* slime trail */}
      <path
        className="ds-snail-trail"
        d="M2 39 q 7 -5 14 0 t 14 0"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <g className="ds-snail">
        {/* foot */}
        <path
          className="ds-snail-foot"
          d="M9 38 Q 32 44 52 37 Q 49 41 42 41 L 16 41 Q 10 41 9 38 Z"
          fill="currentColor"
          fillOpacity="0.9"
        />
        {/* neck + head */}
        <path
          d="M41 38 C 54 38 55 22 50 15 C 48 12 44 13 44 17 C 47 24 44 33 37 34 Z"
          fill="currentColor"
          fillOpacity="0.55"
        />
        {/* eye stalks */}
        <line x1="47" y1="16" x2="43" y2="7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <line x1="51" y1="16" x2="53" y2="6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle className="ds-snail-eye" cx="42.5" cy="6" r="2.4" fill="currentColor" />
        <circle className="ds-snail-eye" cx="53.5" cy="5" r="2.4" fill="currentColor" />
        {/* shell */}
        <circle cx="25" cy="27" r="13" fill="currentColor" fillOpacity="0.18" />
        <circle cx="25" cy="27" r="13" stroke="currentColor" strokeWidth="2.4" />
        <path
          d="M25 27 m0 -8 a8 8 0 1 1 -6 3.2"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="25" cy="27" r="2.3" fill="currentColor" />
        {/* tiny data parcel riding the shell */}
        <g transform="rotate(-10 25 12)">
          <rect x="19" y="6" width="12" height="11" rx="2" fill="currentColor" fillOpacity="0.85" />
          <path d="M25 6 v11 M19 11 h12" stroke="var(--color-surface)" strokeWidth="1.4" />
        </g>
      </g>
    </svg>
  );
}

export function NetworkActivity() {
  const [active, setActive] = useState(false);
  const [slow, setSlow] = useState(false);
  const [lineIdx, setLineIdx] = useState(() => Math.floor(Math.random() * SLOW_LINES.length));

  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return onApiActivity(({ inFlight, slow: isSlow }) => {
      if (inFlight > 0) {
        if (!showTimer.current) {
          showTimer.current = setTimeout(() => {
            setActive(true);
            showTimer.current = null;
          }, SHOW_DELAY_MS);
        }
      } else {
        if (showTimer.current) {
          clearTimeout(showTimer.current);
          showTimer.current = null;
        }
        setActive(false);
      }
      setSlow(isSlow);
      if (isSlow) setActive(true);
    });
  }, []);

  // Rotate the caption every few seconds while the slow banner is up.
  useEffect(() => {
    if (!slow) return;
    const t = setInterval(
      () => setLineIdx((i) => (i + 1) % SLOW_LINES.length),
      4000,
    );
    return () => clearInterval(t);
  }, [slow]);

  const line = useMemo(() => SLOW_LINES[lineIdx], [lineIdx]);

  if (!active && !slow) return null;

  return (
    <>
      {/* thin indeterminate bar — always shown while requests are in flight */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5 overflow-hidden"
      >
        <div className={slow ? "ds-net-bar ds-net-bar-slow" : "ds-net-bar"} />
      </div>

      {slow && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-0 z-[199] flex justify-center px-3"
        >
          <div className="ds-slownet flex max-w-md items-center gap-3 rounded-b-[var(--radius-lg)] px-4 py-2.5">
            <SnailMascot />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-text">Network&apos;s crawling…</p>
              <p
                key={lineIdx}
                className="ds-slownet-caption truncate text-[11px] text-text-secondary"
              >
                {line}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
