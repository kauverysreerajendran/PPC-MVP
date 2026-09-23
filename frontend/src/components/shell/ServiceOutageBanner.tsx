"use client";

import { useSyncExternalStore } from "react";
import { ServerOff } from "lucide-react";
import { getOutages, subscribe, type ServiceOutage } from "@/lib/perf";

const EMPTY: readonly ServiceOutage[] = [];
const getServerSnapshot = () => EMPTY;

/**
 * One line under the header naming every backend process the proxy could not
 * reach (see `lib/api/client.ts`). Disappears on its own as soon as a request
 * to that service succeeds again — polling keeps trying, so no reload needed.
 */
export function ServiceOutageBanner() {
  const outages = useSyncExternalStore(subscribe, getOutages, getServerSnapshot);
  if (outages.length === 0) return null;

  const names = outages.map((o) => `${o.service.name} (:${o.service.port})`);
  const many = outages.length > 1;
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)] px-4 py-1.5 text-xs text-[var(--color-danger)]"
      title={outages.map((o) => `${o.service.name}: last failed call ${o.path}`).join("\n")}
    >
      <ServerOff className="size-3.5 shrink-0" />
      <span className="font-semibold">
        {many ? "Services not running:" : "Service not running:"}
      </span>
      <span className="truncate">{names.join(", ")}</span>
      {isDev ? (
        <span className="ml-auto hidden shrink-0 font-mono text-[11px] opacity-80 sm:inline">
          python dev.py
        </span>
      ) : null}
    </div>
  );
}
