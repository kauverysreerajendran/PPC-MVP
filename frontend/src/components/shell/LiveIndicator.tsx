"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { getNetworkState, subscribe } from "@/lib/perf";

type ConnState = "live" | "slow" | "reconnecting" | "offline";

const DOT: Record<ConnState, string> = {
  live: "bg-[var(--color-success)]",
  slow: "bg-[var(--color-warning)]",
  reconnecting: "bg-[var(--color-warning)]",
  offline: "bg-[var(--color-danger)]",
};
const LABEL: Record<ConnState, string> = {
  live: "LIVE",
  slow: "SLOW NETWORK",
  reconnecting: "RECONNECTING",
  offline: "OFFLINE",
};

const getServerNetworkState = () => "fast" as const;

export function LiveIndicator() {
  const [now, setNow] = useState<Date | null>(null);
  const [state, setState] = useState<Exclude<ConnState, "slow">>("live");
  // "slow" is derived from measured request timings (lib/perf.ts): the last
  // three API calls were network- or server-dominated. It tells the user the
  // delay is the connection, not the app, and lib/polling.ts backs off.
  const network = useSyncExternalStore(subscribe, getNetworkState, getServerNetworkState);
  const shown: ConnState = state === "live" && network === "slow" ? "slow" : state;

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
      <span
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-text-secondary"
        title={
          shown === "slow"
            ? "Recent requests were slow — the network or server is the delay, refresh rate reduced"
            : undefined
        }
      >
        <span
          className={cn("size-1.5 rounded-full", DOT[shown], shown === "live" && "animate-pulse")}
        />
        {LABEL[shown]}
      </span>
      <span className="hidden text-right tabular-nums leading-tight sm:block">
        <span className="block text-sm font-bold text-text" suppressHydrationWarning>
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
