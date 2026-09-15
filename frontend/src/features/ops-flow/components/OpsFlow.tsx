import { STAGES } from "../types";
import { FlowConnector } from "./FlowConnector";
import { FlowNode } from "./FlowNode";

/**
 * The MVP operations flow on the Overview screen: the five steps material goes
 * through, vendor dispatch to rack placement. Static content — the planned
 * process, not a reading of the database — so it renders the same on a fresh
 * system. A server component: nothing here needs the browser.
 */
export function OpsFlow() {
  return (
    <section aria-labelledby="ops-flow-heading" className="ds-animate-fade-up mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div>
          <h3 id="ops-flow-heading" className="text-sm font-semibold">
            Operations flow
          </h3>
          <p className="text-xs text-text-secondary">
            How a consignment moves through the MVP — vendor dispatch to rack placement.
          </p>
        </div>
        <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted">
          Planned process
        </span>
      </div>

      <ol className="ops-flow-track">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          return (
            <li key={stage.key} className="ops-flow-item">
              <FlowNode
                step={i}
                title={stage.title}
                detail={stage.detail}
                icon={<Icon />}
                href={stage.href}
              />
              <FlowConnector step={i} end={i === STAGES.length - 1} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
