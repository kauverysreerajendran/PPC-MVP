"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Lock, PackageCheck, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import type { SapOutward } from "@/features/masterdata/types";
import { OutwardDocumentModal } from "@/features/sap/components/receipts/OutwardDocumentModal";
import { PurchaseOrderPreview } from "@/features/sap/components/receipts/PurchaseOrderPreview";
import { TitanChallanPreview } from "@/features/sap/components/receipts/TitanChallanPreview";
import {
  OUTWARD_DOCUMENT_TITLE,
  vendorLabel,
  type OutwardDocKind,
} from "@/features/sap/components/receipts/types";
import { fmtNum } from "../utils/format";
import { digitsOnly, receivingPreview, validateReceiving } from "../utils/receiving";

const DOC_TABS: { kind: OutwardDocKind; tag: string }[] = [
  { kind: "dc", tag: "DC" },
  { kind: "po", tag: "PO" },
];

/** Digits allowed in a quantity field — above any lot on a challan. */
const QTY_MAX_LENGTH = 7;

type Props = {
  line: SapOutward;
  vendorName: string | null;
  pending: boolean;
  /** conflict / validation message from the last Record, shown on the form */
  serverError: string | null;
  onRecord: (accepted: number, rejected: number) => void;
  onCancel: () => void;
};

/**
 * Step 2 of receiving on SAP Inward: the scanned box's outward line and its
 * documents, and the accepted / QED-rejected quantities to record.
 */
export function ReceivingPanel({ line, vendorName, pending, serverError, onRecord, onCancel }: Props) {
  const [doc, setDoc] = useState<OutwardDocKind>("dc");
  const [viewing, setViewing] = useState(false);
  const closeView = useCallback(() => setViewing(false), []);
  const vendor = vendorLabel(vendorName, line.vendor_code);
  const lot = line.quantity == null ? null : Number(line.quantity);

  const facts: [string, ReactNode][] = [
    ["DC no", line.dc_no ?? "—"],
    ["PO no", line.po_no ?? "—"],
    ["Model", line.model_no ?? "—"],
    ["Vendor", vendor],
    ["Lot qty", fmtNum(line.quantity)],
    ["Expected pieces", String(line.expected_pieces)],
  ];

  return (
    <section
      aria-label={`Receiving box ${line.box_uid ?? ""}`}
      className="mb-3 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-primary)_35%,var(--color-border))] bg-surface p-4 shadow-[var(--shadow-sm)]"
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text">
          <PackageCheck className="size-4 text-primary" />
          Receiving
        </h2>
        <span className="ds-chip ds-chip-0 font-mono" title="Scanned Box UID">
          <Lock className="size-3" />
          <span>{line.box_uid}</span>
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          aria-label="Close receiving"
          className="ds-focus-ring ml-auto rounded p-1 text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-55"
        >
          <X className="size-4" />
        </button>
      </header>

      <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2 py-1.5">
            <dt className="text-[10px] text-text-secondary">{k}</dt>
            <dd className="break-words text-xs font-medium text-text">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {lot == null ? (
          <p role="alert" className="text-xs text-[var(--color-danger)]">
            This line has no lot qty, so the accepted qty cannot be checked.
          </p>
        ) : (
          <QuantityForm lot={lot} pending={pending} serverError={serverError} onRecord={onRecord} />
        )}

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Outward documents" className="flex flex-wrap gap-1">
              {DOC_TABS.map((t) => (
                <button
                  key={t.kind}
                  type="button"
                  role="tab"
                  aria-selected={doc === t.kind}
                  onClick={() => setDoc(t.kind)}
                  className={cn(
                    "ds-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-1 text-xs font-medium transition-colors",
                    doc === t.kind
                      ? "border-primary bg-[var(--color-primary-light)] text-primary"
                      : "border-border-strong text-text-secondary hover:border-primary",
                  )}
                >
                  {OUTWARD_DOCUMENT_TITLE[t.kind]} ({t.tag})
                </button>
              ))}
            </div>
            <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setViewing(true)}>
              View
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
          <div role="tabpanel" aria-label={OUTWARD_DOCUMENT_TITLE[doc]}>
            {doc === "dc" ? (
              <TitanChallanPreview line={line} vendorLabel={vendor} />
            ) : (
              <PurchaseOrderPreview line={line} vendorLabel={vendor} />
            )}
          </div>
        </div>
      </div>

      <OutwardDocumentModal
        view={viewing ? { kind: doc, line, vendorLabel: vendor } : null}
        onClose={closeView}
      />
    </section>
  );
}

/** Accepted / QED-rejected quantities with a live front / back / shortage preview. */
function QuantityForm({
  lot,
  pending,
  serverError,
  onRecord,
}: {
  lot: number;
  pending: boolean;
  serverError: string | null;
  onRecord: (accepted: number, rejected: number) => void;
}) {
  const [accepted, setAccepted] = useState("");
  const [rejected, setRejected] = useState("");
  const [touched, setTouched] = useState({ accepted: false, rejected: false });
  const acceptedRef = useRef<HTMLInputElement>(null);
  const rejectedRef = useRef<HTMLInputElement>(null);

  // The operator types the quantity straight after the scan.
  useEffect(() => {
    acceptedRef.current?.focus();
  }, []);

  const errors = validateReceiving(lot, accepted, rejected);
  const acceptedError = touched.accepted ? errors.accepted : undefined;
  const rejectedError = touched.rejected ? errors.rejected : undefined;
  const preview =
    accepted === "" ? null : receivingPreview(lot, Number(accepted), Number(rejected || 0));

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched({ accepted: true, rejected: true });
    if (errors.accepted) {
      acceptedRef.current?.focus();
      return;
    }
    if (errors.rejected) {
      rejectedRef.current?.focus();
      return;
    }
    onRecord(Number(accepted), Number(rejected || 0));
  }

  return (
    <form onSubmit={submit} noValidate className="min-w-0 space-y-3">
      {serverError ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger)]"
        >
          <TriangleAlert className="mt-px size-4 shrink-0" />
          {serverError}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Input
          ref={acceptedRef}
          label="Accepted qty"
          required
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={QTY_MAX_LENGTH}
          value={accepted}
          onChange={(e) => setAccepted(digitsOnly(e.target.value))}
          onBlur={() => setTouched((t) => ({ ...t, accepted: true }))}
          hint="As per vendor mail / QED sheet"
          {...(acceptedError ? { error: acceptedError } : {})}
        />
        <Input
          ref={rejectedRef}
          label="QED rejected qty"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={QTY_MAX_LENGTH}
          placeholder="0"
          value={rejected}
          onChange={(e) => setRejected(digitsOnly(e.target.value))}
          onBlur={() => setTouched((t) => ({ ...t, rejected: true }))}
          hint="Optional"
          {...(rejectedError ? { error: rejectedError } : {})}
        />
      </div>

      {preview ? (
        <dl aria-live="polite" className="grid grid-cols-2 gap-2 text-xs">
          <PreviewStat label="Front cases" hint="accepted ÷ 2" value={fmtNum(preview.front)} />
          <PreviewStat label="Back cases" hint="accepted ÷ 2" value={fmtNum(preview.back)} />
          <PreviewStat label="Received" hint="= accepted" value={fmtNum(preview.received)} />
          <PreviewStat
            label="Shortage"
            hint="lot − accepted − rejected"
            value={fmtNum(preview.shortage)}
            tone={preview.shortage > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}
          />
        </dl>
      ) : rejected === "" ? (
        <p className="text-xs text-text-muted">
          Example: lot 300 → accepted 150 → 75 front / 75 back, received 150, shortage 150.
        </p>
      ) : null}

      <Button type="submit" size="sm" fullWidth loading={pending} disabled={pending}>
        <PackageCheck className="size-4" />
        Record
      </Button>
    </form>
  );
}

function PreviewStat({
  label,
  hint,
  value,
  tone,
}: {
  label: string;
  hint: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2 py-1.5">
      <dt className="text-[10px] text-text-secondary">
        {label} <span className="text-text-muted">({hint})</span>
      </dt>
      <dd className={cn("text-sm font-semibold tabular-nums text-text", tone)}>{value}</dd>
    </div>
  );
}
