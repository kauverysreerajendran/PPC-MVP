import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/**
 * The rail between two steps. `step` puts its token on the shared walk schedule
 * (see the ops-flow section of globals.css) so the token leaves a node just
 * after that node lights up.
 *
 * `end` renders the same box with no rail and no token, which keeps every card
 * in the row exactly the same width without animating anything off-screen.
 */
export function FlowConnector({ step, end = false }: { step: number; end?: boolean }) {
  return (
    <span
      className={cn("ops-flow-rail", end && "ops-flow-rail--end")}
      style={{ "--ops-flow-step": String(step) } as CSSProperties}
      aria-hidden
    >
      {end ? null : <span className="ops-flow-token" />}
    </span>
  );
}
