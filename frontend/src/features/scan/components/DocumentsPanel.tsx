"use client";

import { useId, useState } from "react";
import { Expand, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  OutwardDocumentModal,
  type OutwardDocumentView,
} from "@/features/sap/components/receipts/OutwardDocumentModal";
import { PurchaseOrderPreview } from "@/features/sap/components/receipts/PurchaseOrderPreview";
import { TitanChallanPreview } from "@/features/sap/components/receipts/TitanChallanPreview";
import {
  OUTWARD_DOCUMENT_TITLE,
  type OutwardDocKind,
  type OutwardDocumentLine,
} from "@/features/sap/components/receipts/types";
import { cn } from "@/lib/cn";
import { Panel } from "./parts";

const KINDS: OutwardDocKind[] = ["dc", "po"];

/**
 * The line's Titan challan and purchase order: a reduced preview in tabs, and
 * View for the full sheet in the same modal SAP Outward opens.
 */
export function DocumentsPanel({
  line,
  vendorLabel,
  note,
}: {
  line: OutwardDocumentLine;
  vendorLabel: string;
  /** the back-order note printed under the sheet, as on SAP Outward */
  note?: string | undefined;
}) {
  const [kind, setKind] = useState<OutwardDocKind>("dc");
  const [view, setView] = useState<OutwardDocumentView | null>(null);
  const base = useId();
  const no = (k: OutwardDocKind) => (k === "dc" ? line.dc_no : line.po_no);

  return (
    <Panel
      icon={<FileText />}
      title="Documents"
      bodyClassName="p-0"
      actions={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setView({ kind, line, vendorLabel, note })}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Expand className="size-3.5" aria-hidden />
          View
        </Button>
      }
    >
      <div role="tablist" aria-label="Outward documents" className="flex gap-1 border-b border-border px-3 pt-2">
        {KINDS.map((k) => (
          <button
            key={k}
            id={`${base}-tab-${k}`}
            type="button"
            role="tab"
            aria-selected={kind === k}
            aria-controls={`${base}-panel-${k}`}
            tabIndex={kind === k ? 0 : -1}
            onClick={() => setKind(k)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                const next = kind === "dc" ? "po" : "dc";
                setKind(next);
                document.getElementById(`${base}-tab-${next}`)?.focus();
              }
            }}
            className={cn(
              "ds-focus-ring -mb-px flex min-w-0 items-baseline gap-1.5 rounded-t-[var(--radius-sm)] border-b-2 px-2.5 py-1.5 text-xs font-medium transition-colors",
              kind === k
                ? "border-primary text-text"
                : "border-transparent text-text-secondary hover:text-text",
            )}
          >
            {OUTWARD_DOCUMENT_TITLE[k]}
            <span className="truncate font-mono text-[10px] text-text-muted">{no(k) ?? "—"}</span>
          </button>
        ))}
      </div>
      <div
        id={`${base}-panel-${kind}`}
        role="tabpanel"
        aria-labelledby={`${base}-tab-${kind}`}
        className="relative h-[300px] overflow-hidden bg-surface-2"
      >
        {/* A reduced, non-interactive copy of the sheet; View opens it in full. */}
        <div className="pointer-events-none select-none p-2 [zoom:0.5] sm:[zoom:0.6]" aria-hidden>
          {kind === "dc" ? (
            <TitanChallanPreview line={line} vendorLabel={vendorLabel} />
          ) : (
            <PurchaseOrderPreview line={line} vendorLabel={vendorLabel} />
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-2 to-transparent" />
        <button
          type="button"
          onClick={() => setView({ kind, line, vendorLabel, note })}
          className="ds-focus-ring absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-medium text-primary shadow-[var(--shadow-md)] transition-colors hover:border-primary"
        >
          Open full {OUTWARD_DOCUMENT_TITLE[kind].toLowerCase()}
        </button>
      </div>
      <OutwardDocumentModal view={view} onClose={() => setView(null)} />
    </Panel>
  );
}
