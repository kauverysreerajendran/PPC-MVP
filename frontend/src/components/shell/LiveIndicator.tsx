"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type ConnState = "live" | "reconnecting" | "offline";

const DOT: Record<ConnState, string> = {
  live: "bg-[var(--color-success)]",
  reconnecting: "bg-[var(--color-warning)]",
  offline: "bg-[var(--color-danger)]",
};
const LABEL: Record<ConnState, string> = {
  live: "LIVE",
  reconnecting: "RECONNECTING",
  offline: "OFFLINE",
};

export function LiveIndicator() {
  const [now, setNow] = useState<Date | null>(null);
  const [state, setState] = useState<ConnState>("live");

  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      setNow(new Date());
      if (t) return;
      t = setInterval(() => setNow(new Date()), 1000);
    };
    const stop = () => {
      if (t) clearInterval(t);
      t = undefined;
    };
    // Only tick while the tab is visible — a background tab doesn't need a clock.
    const onVisibility = () => (document.hidden ? stop() : start());

    const on = () => setState("live");
    const off = () => setState("offline");
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", onVisibility);
    if (!navigator.onLine) setState("offline");
    if (!document.hidden) start();

    return () => {
      stop();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-text-secondary">
        <span className={cn("size-1.5 rounded-full", DOT[state], state === "live" && "animate-pulse")} />
        {LABEL[state]}
      </span>
      <span className="hidden text-right tabular-nums leading-tight sm:block">
        <span className="block text-xs font-semibold" suppressHydrationWarning>
          {now ? now.toLocaleTimeString([], { hour12: false }) : "--:--:--"}
        </span>
        <span className="block text-[10px] text-text-muted" suppressHydrationWarning>
          {now
            ? now.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })
            : ""}
        </span>
      </span>
    </div>
  );
}
