"use client";

import type { ReactNode } from "react";
import { ArrowRight, FileText } from "lucide-react";
import { HoverCard } from "@/components/ui/HoverCard";
import { fmtDate, fmtNum } from "@/features/sap-inward/utils/format";
import { OUTWARD_DOCUMENT_TITLE, type OutwardDocKind, type OutwardDocumentLine } from "./receipts/types";

/**
 * DC / PO cell on SAP Outward: hovering (or focusing / clicking) the number
 * shows the document's key facts, and View opens the full sheet.
 */
export function OutwardDocumentHover({
  kind,
  line,
  boxUid,
  vendorLabel,
  trigger,
  onView,
}: {
  kind: OutwardDocKind;
  line: OutwardDocumentLine;
  boxUid: string | null;
  vendorLabel: string;
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
