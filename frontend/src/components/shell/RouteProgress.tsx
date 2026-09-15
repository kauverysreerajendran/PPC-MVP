"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Global navigation buffering indicator.
 *
 * A single thin top progress bar for every page transition and hard refresh —
 * the only other buffering state in the app is <BootLoader/>'s full-screen
 * "Getting things ready…" overlay, reserved for the true first paint.
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
    setPct(8);
    trickle.current = setInterval(() => {
      setPct((p) => (p >= 90 ? p : p + Math.max(0.5, (90 - p) * 0.08)));
    }, 200);
  }

  function done() {
    if (!running.current) return;
    running.current = false;
    clearTimers();
    setPct(100);
    timers.current.push(setTimeout(() => setVisible(false), 220));
    timers.current.push(setTimeout(() => setPct(0), 460));
  }

  // Navigation finished whenever the resolved pathname changes.
  useEffect(() => {
    done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Safety net for <BootLoader/>'s #ds-boot overlay: its own inline <script>
  // only runs when the browser parses it as part of a real document load. A
  // client-side `router.refresh()` (e.g. right after login) re-streams the
  // root layout's Server Component output and can reinsert that markup fresh
  // via RSC DOM patching — which does *not* re-execute the script — so the
  // overlay is left stuck at opacity 1 forever, blocking the whole app. A
  // MutationObserver fires on any insertion method, so it clears the overlay
  // no matter how the node arrived.
  useEffect(() => {
    const clear = (el: Element) => {
      if (el.getAttribute("data-done") === "1") return;
      el.setAttribute("data-done", "1");
      setTimeout(() => el.parentNode?.removeChild(el), 450);
    };
    // Same semantics as BootLoader's inline script: dismiss as soon as the
    // document is parsed and React can hydrate — not after every image and
    // font has finished downloading (docs/08 §1.4).
    const clearWhenReady = (el: Element) => {
      if (document.readyState !== "loading") clear(el);
      else document.addEventListener("DOMContentLoaded", () => clear(el), { once: true });
    };

    const existing = document.getElementById("ds-boot");
    if (existing) clearWhenReady(existing);

    // BootLoader's markup is a direct child of <body> (app/layout.tsx), so only
    // body's own child list needs watching. `subtree: false` means this callback
    // runs when something is appended to <body> itself (rare: the boot overlay
    // reinserted by an RSC refresh, a portal) — never on the table re-renders
    // deeper in the tree that the old `subtree: true` observer reacted to on
    // every poll (docs/05 §5.6, docs/08 §1).
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.id === "ds-boot") clearWhenReady(node);
          else {
            const nested = node.querySelector?.("#ds-boot");
            if (nested) clearWhenReady(nested);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });
    return () => observer.disconnect();
  }, []);

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
          // Next's App Router can call pushState from inside a
          // useInsertionEffect during a transition; scheduling a state update
          // synchronously from there throws. Defer to a microtask so `start()`
          // always runs after React's insertion-effect phase has flushed.
          if (next.pathname !== window.location.pathname) queueMicrotask(start);
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
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5">
      <div
        className="h-full bg-primary shadow-[0_0_8px_var(--color-primary)] transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${pct}%`, opacity: pct >= 100 ? 0 : 1 }}
      />
    </div>
  );
}
