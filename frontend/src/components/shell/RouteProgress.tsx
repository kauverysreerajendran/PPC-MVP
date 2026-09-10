"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Hourglass } from "lucide-react";

/**
 * Global navigation buffering indicator.
 *
 * Shows a thin top progress bar (and, for slower loads, a centered hourglass
 * card) whenever the user navigates between pages or hard-refreshes the app.
 *
 * App Router exposes no router events, so navigation *start* is detected by
 * intercepting same-document link clicks and patching `history.pushState`;
 * navigation *end* is the resulting `usePathname()` change. A hard refresh is
 * covered via `document.readyState` on mount.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [pct, setPct] = useState(0);
  const [showHourglass, setShowHourglass] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const running = useRef(false);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (trickle.current) {
      clearInterval(trickle.current);
      trickle.current = null;
    }
  }

  function start() {
    if (running.current) return;
    running.current = true;
    clearTimers();
    setVisible(true);
    setShowHourglass(false);
    setPct(8);
    trickle.current = setInterval(() => {
      setPct((p) => (p >= 90 ? p : p + Math.max(0.5, (90 - p) * 0.08)));
    }, 200);
    // Only escalate to the hourglass overlay when the load is genuinely slow.
    timers.current.push(setTimeout(() => setShowHourglass(true), 450));
  }

  function done() {
    if (!running.current) return;
    running.current = false;
    clearTimers();
    setPct(100);
    setShowHourglass(false);
    timers.current.push(setTimeout(() => setVisible(false), 220));
    timers.current.push(setTimeout(() => setPct(0), 460));
  }

  // Navigation finished whenever the resolved pathname changes.
  useEffect(() => {
    done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Hard refresh / first paint: run the bar until the document is ready.
  useEffect(() => {
    if (document.readyState !== "complete") {
      start();
      const onLoad = () => done();
      window.addEventListener("load", onLoad, { once: true });
      return () => window.removeEventListener("load", onLoad);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect client-side navigation start.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };

    const patch = (key: "pushState" | "replaceState") => {
      const original = history[key];
      history[key] = function (this: History, ...args: Parameters<History["pushState"]>) {
        const url = args[2];
        if (url) {
          const next = new URL(url, window.location.href);
          if (next.pathname !== window.location.pathname) start();
        }
        return original.apply(this, args);
      };
      return () => {
        history[key] = original;
      };
    };

    document.addEventListener("click", onClick, true);
    const unpatchPush = patch("pushState");
    window.addEventListener("popstate", start);

    return () => {
      document.removeEventListener("click", onClick, true);
      unpatchPush();
      window.removeEventListener("popstate", start);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5"
      >
        <div
          className="h-full bg-primary shadow-[0_0_8px_var(--color-primary)] transition-[width,opacity] duration-200 ease-out"
          style={{ width: `${pct}%`, opacity: pct >= 100 ? 0 : 1 }}
        />
      </div>

      {showHourglass && (
        <div
          role="status"
          aria-live="polite"
          className="ds-animate-fade pointer-events-none fixed inset-0 z-[199] flex items-center justify-center"
        >
          <div className="ds-animate-scale flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface/95 px-6 py-5 shadow-[var(--shadow-lg)] backdrop-blur-sm">
            <Hourglass className="ds-hourglass size-6 text-primary" />
            <span className="text-xs text-text-secondary">Loading…</span>
          </div>
        </div>
      )}
    </>
  );
}
