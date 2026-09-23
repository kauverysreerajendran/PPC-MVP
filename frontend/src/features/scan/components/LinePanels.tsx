"use client";

import type { ReactNode } from "react";
import { Fingerprint, Route, Scale, TriangleAlert } from "lucide-react";
import { fmtDate, fmtNum } from "@/features/sap-inward/utils/format";
import { shortageTrail, qtyOf } from "@/features/sap/shortageTrail";
import { cn } from "@/lib/cn";
import type { ScanLine } from "../resolve";
import { buildTimeline } from "../timeline";
import type { StageStatuses } from "../hooks";
import { useParentLine } from "../hooks";
import { StageTimeline } from "./StageTimeline";
import { Copyable, Dash, Field, Panel, PanelNotice } from "./parts";

/** The fields every panel reads, from whichever service has the line. */
export function lineFacts(line: ScanLine) {
  const o = line.outward;
  const f = line.feed;
  return {
    ref: line.ref,
    boxUid: o?.box_uid ?? null,
    dcNo: o?.dc_no ?? f?.dc_no ?? null,
    poNo: o?.po_no ?? f?.po_no ?? null,
    model: o?.model_no ?? f?.model_no ?? null,
    vendorCode: o?.vendor_code ?? f?.vendor_code ?? null,
    feedVendorName: f?.vendor_name ?? null,
    batch: o?.batch_no ?? f?.batch_no ?? null,
    lot: o?.lot_no ?? f?.lot_no ?? null,
    date: o?.transaction_date ?? f?.transaction_date ?? null,
    quantity: o?.quantity ?? f?.quantity ?? null,
    shortage: o?.origin === "SHORTAGE",
    parentRef: o?.parent_sap_reference_id ?? null,
  };
}

/** A copyable monospace identifier, or a dash. */
function Id({ value, label }: { value: string | null; label: string }) {
  return value ? (
    <Copyable value={value} label={label} className="font-mono text-[13px]" />
  ) : (
    <Dash />
  );
}

export function IdentityPanel({
  line,
  vendorName,
}: {
  line: ScanLine;
  vendorName: string | null;
}) {
  const x = lineFacts(line);
  const name = vendorName ?? x.feedVendorName;
  return (
    <Panel icon={<Fingerprint />} title="Identity">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">Box UID</p>
          {x.boxUid ? (
            <Copyable
              value={x.boxUid}
              label="Box UID"
              className="mt-0.5 font-mono text-[28px] font-semibold leading-tight tracking-tight text-text sm:text-[32px]"
            />
          ) : (
            <p className="mt-0.5 text-2xl font-semibold leading-tight text-text-muted">Not dispatched</p>
          )}
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
            <span className="shrink-0">SAP ref</span>
            <Copyable value={x.ref} label="SAP reference" className="font-mono text-text-secondary" />
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {x.shortage ? (
            <span className="ds-chip ds-chip-orange">
              <TriangleAlert className="size-3" aria-hidden />
              Shortage back-order
            </span>
          ) : null}
          {!line.outward ? <span className="ds-chip ds-chip-muted">SAP feed only</span> : null}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-3">
        <Field label="DC no">
          <Id value={x.dcNo} label="DC no" />
        </Field>
        <Field label="PO no">
          <Id value={x.poNo} label="PO no" />
        </Field>
        <Field label="Date">{x.date ? fmtDate(x.date) : <Dash />}</Field>
        <Field label="Model">
          {x.model ? <Copyable value={x.model} label="Model" className="ds-chip font-mono" /> : <Dash />}
        </Field>
        <Field label="Vendor">
          {x.vendorCode ? (
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{name ?? "—"}</span>
              <Copyable
                value={x.vendorCode}
                label="Vendor code"
                className="font-mono text-[11px] font-normal text-text-muted"
              />
            </span>
          ) : (
            <Dash />
          )}
        </Field>
        <Field label="Batch">
          <Id value={x.batch} label="Batch" />
        </Field>
        <Field label="Lot">
          <Id value={x.lot} label="Lot" />
        </Field>
        {x.shortage ? (
          <Field label="Raised from">
            <Id value={x.parentRef} label="Shortage parent reference" />
          </Field>
        ) : null}
      </dl>
    </Panel>
  );
}

/** One right-aligned quantity row. */
function QtyRow({
  label,
  value,
  strong,
  danger,
}: {
  label: string;
  value: number | null;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className={strong ? "font-semibold text-text" : "text-text-secondary"}>{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          strong ? "font-semibold" : "font-medium",
          danger ? "inline-flex items-center gap-1 text-[var(--color-danger)]" : "text-text",
        )}
      >
        {danger ? <TriangleAlert className="size-3" aria-label="short" /> : null}
        {value == null ? "—" : fmtNum(value)}
      </dd>
    </div>
  );
}

function QtyBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">{title}</p>
      <dl className="divide-y divide-border text-xs">{children}</dl>
    </div>
  );
}

/**
 * Lot, accepted, QED rejected, received, shortage. A back-order also shows the
 * trail it was raised from — built by the same `shortageTrail` as SAP
 * Outward's DC / PO hover, so the two never disagree.
 */
export function QuantitiesPanel({ line }: { line: ScanLine }) {
  const o = line.outward;
  const x = lineFacts(line);
  const parent = useParentLine(x.shortage ? x.parentRef : null);
  const recorded = !!o && (o.received_pieces > 0 || !!o.inward_status);
  const shortage = recorded ? qtyOf(o?.shortage_qty) : null;
  const trail = o && x.shortage ? shortageTrail(o, parent.data ?? undefined) : null;

  return (
    <Panel icon={<Scale />} title="Quantities">
      <div className={cn("grid gap-x-6 gap-y-4", trail && "sm:grid-cols-2")}>
        <QtyBlock title={trail ? "This line" : "Receiving"}>
          <QtyRow label="Lot qty" value={qtyOf(x.quantity)} />
          <QtyRow label="Accepted" value={recorded ? qtyOf(o?.received_qty) : null} />
          <QtyRow label="QED rejected" value={recorded ? (o?.rejected_qty ?? 0) : null} />
          <QtyRow label="Received" value={recorded ? qtyOf(o?.received_qty) : null} />
          <QtyRow label="Shortage" value={shortage} strong danger={(shortage ?? 0) > 0} />
        </QtyBlock>
        {trail ? (
          <QtyBlock title="Shortage from receiving">
            <QtyRow label="Original lot qty" value={trail.lotQty} />
            <QtyRow label="Accepted" value={trail.accepted} />
            <QtyRow label="QED rejected" value={trail.rejected} />
            <QtyRow label="Received" value={trail.received} />
            <QtyRow label="Pending shortage" value={trail.pendingQty} strong danger />
          </QtyBlock>
        ) : null}
      </div>
      {!recorded ? (
        <p className="mt-2 text-[11px] text-text-muted">
          Nothing received yet — accepted, rejected and shortage fill in on SAP Inward.
        </p>
      ) : null}
    </Panel>
  );
}

export function TimelinePanel({
  line,
  statuses,
  statusDown,
  onRetry,
}: {
  line: ScanLine;
  statuses: StageStatuses | undefined;
  statusDown: boolean;
  onRetry: () => void;
}) {
  const steps = buildTimeline(statuses ?? {}, line.outward);
  return (
    <Panel icon={<Route />} title="Stage timeline">
      {statusDown ? (
        <div className="mb-3">
          <PanelNotice title="Status service unavailable" onRetry={onRetry}>
            Stages below come from the line itself; their times and verification are unknown until
            it is back.
          </PanelNotice>
        </div>
      ) : null}
      <StageTimeline steps={steps} />
    </Panel>
  );
}
