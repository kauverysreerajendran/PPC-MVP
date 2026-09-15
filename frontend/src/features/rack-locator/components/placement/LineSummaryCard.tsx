"use client";

import { PackagePlus } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { SapOutward } from "@/features/masterdata/types";

/**
 * Step 1 of the placement flow: what is being placed. Pure presentation —
 * the blocking states (no received pieces, no model number) are decided by
 * PlacementFlow, which renders `BlockedMessage` instead of this card.
 */
export function LineSummaryCard({
  line,
  placedCount,
  remaining,
}: {
  line: SapOutward;
  placedCount: number;
  remaining: number;
}) {
  const received = line.received_pieces;
  const pct = received ? Math.min(100, Math.round((placedCount / received) * 100)) : 0;
  const done = received > 0 && remaining === 0;
  // Accepted qty (entered on SAP Inward) splits equally into front and back cases.
  const accepted = Number(line.received_qty ?? 0);
  const half = Number.isInteger(accepted / 2) ? accepted / 2 : null;

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text">
          <PackagePlus className="size-4 text-primary" />
          What you are placing
        </h2>
        <StatusBadge
          label={`${placedCount}/${received} placed`}
          tone={done ? "success" : placedCount > 0 ? "orange" : "neutral"}
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Box UID">
          <span className="ds-chip ds-chip-0 font-mono">{line.box_uid ?? "—"}</span>
        </Field>
        <Field label="Model" value={line.model_no ?? "—"} />
        <Field label="Lot" value={line.lot_no ?? "—"} />
        <Field
          label="DC / PO"
          value={`${line.dc_no ?? "—"} / ${line.po_no ?? "—"}`}
          title={`${line.dc_no ?? "—"} / ${line.po_no ?? "—"}`}
        />
        <Field label="SAP ref" value={line.sap_reference_id} mono />
        <Field
          label="Accepted qty"
          value={
            half != null
              ? `${accepted.toLocaleString()} (${half.toLocaleString()} F / ${half.toLocaleString()} B)`
              : accepted.toLocaleString()
          }
        />
      </dl>

      <p className="mt-3 text-xs text-text-secondary">
        <span className="font-semibold text-text">{remaining}</span> of {received} piece
        {received === 1 ? "" : "s"} left to place
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  title,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd
        title={title}
        className={`truncate font-medium text-text ${mono ? "font-mono text-xs" : ""}`}
      >
        {children ?? value}
      </dd>
    </div>
  );
}
