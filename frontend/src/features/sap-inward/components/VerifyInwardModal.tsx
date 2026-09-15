"use client";

import { useState } from "react";
import { CheckCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import type { SapOutward } from "@/features/masterdata/types";
import { INWARD_DOCUMENTS, type InwardDocument } from "../documents";
import { useInwardScans } from "../hooks";
import { fmtNum, INWARD_LABEL, INWARD_TONE } from "../utils/format";
import { GoodsIssueSlipPreview } from "./receipts/GoodsIssueSlipPreview";
import { QedAuditSheetPreview } from "./receipts/QedAuditSheetPreview";
import { TitanChallanPreview } from "./receipts/TitanChallanPreview";
import { VendorChallanPreview } from "./receipts/VendorChallanPreview";

/** Same message the verify endpoint returns for a line with nothing received. */
const NOTHING_RECEIVED = "Nothing has been received on this line yet — scan a box first.";

type Props = {
  row: SapOutward | null;
  vendorName: Map<string, string>;
  pending: boolean;
  onConfirm: (row: SapOutward, documents: InwardDocument[]) => void;
  onClose: () => void;
};

/**
 * Verification window: the four inward receipts for one line, Sent vs Received
 * for its Box UID, and a per-document checklist that gates Verify.
 */
export function VerifyInwardModal(props: Props) {
  if (!props.row) return null;
  // Keyed by line so the checklist starts empty for every line opened.
  return <VerifyInwardWindow key={props.row.id} {...props} row={props.row} />;
}

function VerifyInwardWindow({ row, vendorName, pending, onConfirm, onClose }: Props & { row: SapOutward }) {
  const [active, setActive] = useState<InwardDocument>("gi_slip");
  const [checked, setChecked] = useState<Set<InwardDocument>>(new Set());
  const name = row.vendor_code ? (vendorName.get(row.vendor_code) ?? null) : null;
  const vendorLabel = row.vendor_code ? `${name ?? "—"} (${row.vendor_code})` : "—";
  const nothingReceived = row.received_pieces <= 0;
  const allChecked = INWARD_DOCUMENTS.every((d) => checked.has(d.id));

  function toggle(id: InwardDocument) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Verify receipt — ${row.box_uid ?? row.sap_reference_id}`}
      description={`PO ${row.po_no ?? "—"} · DC ${row.dc_no ?? "—"}`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={pending}
            disabled={!allChecked || nothingReceived}
            onClick={() => onConfirm(row, INWARD_DOCUMENTS.map((d) => d.id))}
          >
            <CheckCheck className="size-4" />
            Confirm verification
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SentVsReceived row={row} />
        {nothingReceived ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger)]"
          >
            <TriangleAlert className="size-4 shrink-0" />
            {NOTHING_RECEIVED}
          </p>
        ) : null}

        <div>
          <div role="tablist" aria-label="Inward receipts" className="mb-2 flex flex-wrap gap-1">
            {INWARD_DOCUMENTS.map((d) => (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={active === d.id}
                onClick={() => setActive(d.id)}
                className={cn(
                  "ds-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2 py-1 text-xs font-medium transition-colors",
                  active === d.id
                    ? "border-primary bg-[var(--color-primary-light)] text-primary"
                    : "border-border-strong text-text-secondary hover:border-primary",
                )}
              >
                {checked.has(d.id) ? <CheckCheck className="size-3.5 text-[var(--color-success)]" /> : null}
                {d.label}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            {active === "gi_slip" ? <GoodsIssueSlipPreview line={row} /> : null}
            {active === "titan_challan" ? <TitanChallanPreview line={row} vendorLabel={vendorLabel} /> : null}
            {active === "vendor_challan" ? (
              <VendorChallanPreview line={row} vendorName={name ?? row.vendor_code ?? "—"} />
            ) : null}
            {active === "qed_sheet" ? <QedAuditSheetPreview line={row} vendorLabel={vendorLabel} /> : null}
          </div>
        </div>

        <fieldset className="rounded-[var(--radius-md)] border border-border p-3">
          <legend className="px-1 text-xs font-semibold text-text">Document checklist</legend>
          <ul className="space-y-1.5">
            {INWARD_DOCUMENTS.map((d) => (
              <li key={d.id}>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-text">
                  <input
                    type="checkbox"
                    checked={checked.has(d.id)}
                    onChange={() => toggle(d.id)}
                    className="size-4 accent-[var(--color-primary)]"
                  />
                  {d.check}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </div>
    </Modal>
  );
}

/** The MVP check: cases sent against this Box UID vs cases scanned in. */
function SentVsReceived({ row }: { row: SapOutward }) {
  const scans = useInwardScans(row.id);
  const code = row.inward_status ?? "PENDING";
  const short = Number(row.shortage_qty ?? 0);
  const stats: { label: string; pieces: number; qty: string; tone?: string }[] = [
    { label: "Sent cases", pieces: row.expected_pieces, qty: fmtNum(row.quantity) },
    { label: "Received cases", pieces: row.received_pieces, qty: fmtNum(row.received_qty ?? 0) },
    {
      label: "Shortage",
      pieces: Math.max(0, row.shortage_pieces),
      qty: fmtNum(row.shortage_qty),
      // Same rule as the grid's Shortage cell.
      tone: short > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]",
    },
  ];

  return (
    <section className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3" aria-label="Sent vs received">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Sent vs received</span>
        {row.box_uid ? <span className="ds-chip ds-chip-0 font-mono">{row.box_uid}</span> : null}
        <StatusBadge label={INWARD_LABEL[code] ?? code} tone={INWARD_TONE[code] ?? "neutral"} />
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {stats.map((st) => (
          <div key={st.label} className="rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1.5">
            <dt className="text-[10px] text-text-secondary">{st.label}</dt>
            <dd className={cn("text-sm font-semibold tabular-nums text-text", st.tone)}>
              {st.pieces} <span className="text-[10px] font-normal text-text-muted">pcs</span>
            </dd>
            <dd className={cn("text-[11px] tabular-nums text-text-secondary", st.tone)}>qty {st.qty}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 max-h-40 overflow-auto rounded-[var(--radius-sm)] border border-border bg-surface">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-2 text-text-secondary">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Scanned at</th>
              <th className="px-2 py-1 text-right font-medium">Piece</th>
              <th className="px-2 py-1 text-left font-medium">PO no</th>
              <th className="px-2 py-1 text-left font-medium">DC no</th>
            </tr>
          </thead>
          <tbody>
            {scans.isLoading ? (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-text-muted">Loading scans…</td>
              </tr>
            ) : scans.isError ? (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-[var(--color-danger)]">
                  Could not load scans.{" "}
                  <button type="button" onClick={() => void scans.refetch()} className="ds-focus-ring underline">
                    Retry
                  </button>
                </td>
              </tr>
            ) : (scans.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-text-muted">No scans recorded.</td>
              </tr>
            ) : (
              [...(scans.data ?? [])]
                .sort((a, b) => b.piece_no - a.piece_no)
                .map((sc) => (
                  <tr key={sc.id} className="border-t border-border">
                    <td className="px-2 py-1 tabular-nums">{new Date(sc.scanned_at).toLocaleString()}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{sc.piece_no}</td>
                    <td className="px-2 py-1">{sc.po_no ?? "—"}</td>
                    <td className="px-2 py-1">{sc.dc_no ?? "—"}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
