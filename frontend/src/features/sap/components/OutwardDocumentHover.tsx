"use client";

import type { ReactNode } from "react";
import { ArrowRight, FileText, TriangleAlert } from "lucide-react";
import { HoverCard } from "@/components/ui/HoverCard";
import { fmtDate, fmtNum } from "@/features/sap-inward/utils/format";
import { OUTWARD_DOCUMENT_TITLE, type OutwardDocKind, type OutwardDocumentLine } from "./receipts/types";

/**
 * The quantity trail of a shortage back-order: the parent lot it was raised
 * from, what the receiving entry accounted for, and this line's own qty as the
 * balance still owed. Every figure may be absent — `null` renders as "—" and is
 * never guessed at or shown as 0.
 */
export interface ShortageTrail {
  /** the parent line's lot qty */
  lotQty: number | null;
  /** accepted on the receiving entry */
  accepted: number | null;
  /** QED-rejected on the receiving entry (0 is a real value, shown as 0) */
  rejected: number | null;
  /** received against the parent line */
  received: number | null;
  /** this line's own qty — the balance still owed */
  pendingQty: number | null;
  /** the parent's sap_reference_id */
  parentRef: string | null;
}

/** One label / value line of the shortage trail. */
function TrailRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="contents">
      <dt className={strong ? "font-semibold text-text" : "text-text-secondary"}>{label}</dt>
      <dd
        className="break-words text-right font-medium tabular-nums text-text"
        {...(strong ? { style: { color: "var(--color-danger)", fontWeight: 600 } } : {})}
      >
        {value}
      </dd>
    </div>
  );
}

/** A figure of the trail, or "—" when it is genuinely unavailable. */
const trailNum = (v: number | null) => (v == null ? "—" : fmtNum(v));

/**
 * DC / PO cell on SAP Outward: hovering (or focusing / clicking) the number
 * shows the document's key facts, and View opens the full sheet.
 *
 * On a shortage back-order the card additionally carries the `shortage` trail,
 * so the lot qty the balance was worked out from is never left unaccountable.
 */
export function OutwardDocumentHover({
  kind,
  line,
  boxUid,
  vendorLabel,
  shortage,
  trigger,
  onView,
}: {
  kind: OutwardDocKind;
  line: OutwardDocumentLine;
  boxUid: string | null;
  vendorLabel: string;
  /** set only on a shortage back-order row — see {@link ShortageTrail} */
  shortage?: ShortageTrail | undefined;
  /** the cell's own rendering of the number */
  trigger: ReactNode;
  onView: () => void;
}) {
  const title = OUTWARD_DOCUMENT_TITLE[kind];
  const no = kind === "dc" ? line.dc_no : line.po_no;
  const facts: [string, ReactNode][] = [
    [kind === "dc" ? "DC no" : "PO no", no ?? "—"],
    ["Date", fmtDate(line.transaction_date)],
    ["Vendor", vendorLabel],
    ["Model", line.model_no ?? "—"],
    ["Lot qty", fmtNum(line.quantity)],
    ["Box UID", boxUid ? <span className="ds-chip ds-chip-0 font-mono">{boxUid}</span> : "—"],
  ];

  return (
    <HoverCard
      align="start"
      label={`${title} ${no ?? ""}`.trim()}
      trigger={trigger}
      triggerClassName="text-primary"
    >
      {(close) => (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            <FileText className="size-3.5 text-primary" />
            {title}
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            {facts.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-text-secondary">{k}</dt>
                <dd className="break-words font-medium text-text">{v}</dd>
              </div>
            ))}
          </dl>
          {shortage ? (
            <div className="mt-2.5 border-t border-border pt-2">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                <TriangleAlert className="size-3.5" style={{ color: "var(--color-danger)" }} />
                Shortage from receiving
              </div>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                <TrailRow label="Original lot qty" value={trailNum(shortage.lotQty)} />
                <TrailRow label="Accepted" value={trailNum(shortage.accepted)} />
                <TrailRow label="QED rejected" value={trailNum(shortage.rejected)} />
                <TrailRow label="Received" value={trailNum(shortage.received)} />
                <TrailRow
                  label="Pending shortage"
                  value={trailNum(shortage.pendingQty)}
                  strong
                />
                <div className="contents">
                  <dt className="text-text-secondary">From</dt>
                  <dd className="select-text break-all text-right font-mono text-[11px] font-medium text-text">
                    {shortage.parentRef ?? "—"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              close();
              onView();
            }}
            className="ds-focus-ring mt-2.5 inline-flex w-full items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary"
          >
            View {title.toLowerCase()}
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      )}
    </HoverCard>
  );
}
