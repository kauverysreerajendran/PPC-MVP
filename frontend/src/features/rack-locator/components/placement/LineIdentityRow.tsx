"use client";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { Boxes, Cpu, FileText, Hash, Layers, PackageCheck, Truck } from "lucide-react";
import type { SapOutward } from "@/features/masterdata/types";
import { cn } from "@/lib/cn";

/**
 * Row 1 of the placement card: what is being placed, as a strip of mini
 * cards — one per fact, each with its own accent so the eye can find Box,
 * Model or Lot without reading captions — and a progress card at the end.
 * Pure presentation — the blocking states (nothing received, no model number)
 * are decided by the locator, which renders `BlockedMessage`.
 *
 * Progress is in *quantity*: trays are filled by qty, so "25 / 60 qty placed"
 * is the number that matches what went into the racks.
 */
export function LineIdentityRow({
  line,
  placedQty,
  receivedQty,
  remainingQty,
}: {
  line: SapOutward;
  placedQty: number;
  receivedQty: number;
  remainingQty: number;
}) {
  const pct = receivedQty ? Math.min(100, Math.round((placedQty / receivedQty) * 100)) : 0;
  const done = receivedQty > 0 && remainingQty === 0;
  // Accepted qty (entered on SAP Inward) splits equally into front and back cases.
  const half = Number.isInteger(receivedQty / 2) ? receivedQty / 2 : null;
  const dcPo = `${line.dc_no ?? "—"} / ${line.po_no ?? "—"}`;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-[repeat(3,minmax(0,0.8fr))_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
      <MiniCard icon={Boxes} accent="var(--color-primary)" caption="Box">
        <span className="font-mono">{line.box_uid ?? "—"}</span>
      </MiniCard>
      <MiniCard icon={Cpu} accent="#7c3aed" caption="Model">
        {line.model_no ?? "—"}
      </MiniCard>
      <MiniCard icon={Layers} accent="#2563eb" caption="Lot">
        {line.lot_no ?? "—"}
      </MiniCard>
      <MiniCard icon={Truck} accent="#c2670f" caption="DC / PO" title={dcPo}>
        {dcPo}
      </MiniCard>
      <MiniCard icon={FileText} accent="#0891b2" caption="SAP ref" title={line.sap_reference_id}>
        <span className="font-mono text-[13px]">{line.sap_reference_id}</span>
      </MiniCard>
      <MiniCard
        icon={Hash}
        accent="#0f9d58"
        caption="Accepted"
        title={
          half != null
            ? `${receivedQty} accepted — ${half} front / ${half} back`
            : `${receivedQty} accepted`
        }
      >
        {receivedQty.toLocaleString()}
        {half != null ? (
          <span className="ml-1.5 text-xs font-normal text-text-muted">
            {half.toLocaleString()} F · {half.toLocaleString()} B
          </span>
        ) : null}
      </MiniCard>

      {/* progress — the one card that reads as status, not identity */}
      <div
        className={cn(
          "col-span-2 flex min-w-0 flex-col justify-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2 sm:col-span-3 xl:col-span-1",
          done
            ? "border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] bg-[var(--color-success-bg)]"
            : "border-[color-mix(in_srgb,var(--color-primary)_22%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-primary)_5%,var(--color-surface))]",
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            <PackageCheck
              className={cn("size-3", done ? "text-[var(--color-success)]" : "text-primary")}
              aria-hidden
            />
            Placed
          </p>
          <p className="text-[11px] tabular-nums text-text-muted">{pct}%</p>
        </div>
        <p className="text-sm font-semibold leading-none tabular-nums text-text">
          {placedQty.toLocaleString()}
          <span className="font-normal text-text-muted"> / {receivedQty.toLocaleString()} qty</span>
        </p>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-surface))]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={receivedQty}
          aria-valuenow={placedQty}
          aria-label="Qty placed"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              done ? "bg-[var(--color-success)]" : "bg-primary",
            )}
            style={{ width: `${Math.max(pct, placedQty > 0 ? 3 : 0)}%` }}
          />
        </div>
        <p className="text-[11px] leading-none tabular-nums text-text-secondary">
          {remainingQty.toLocaleString()} of {receivedQty.toLocaleString()} qty left to place
        </p>
      </div>
    </div>
  );
}

/** One fact as a small card: a tinted icon tile in its accent, a caption, a value. */
function MiniCard({
  icon: Icon,
  accent,
  caption,
  title,
  children,
}: {
  icon: LucideIcon;
  /** any CSS colour — tints the tile, the top edge and the border */
  accent: string;
  caption: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ "--accent": accent } as CSSProperties}
      className={cn(
        "relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-[var(--radius-md)] border px-2.5 py-2",
        "border-[color-mix(in_srgb,var(--accent)_16%,var(--color-border))]",
        "bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_7%,var(--color-surface)),var(--color-surface)_70%)]",
        "shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-shadow hover:shadow-[var(--shadow-sm)]",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
      />
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--accent)_13%,var(--color-surface))] text-[var(--accent)]">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-text-muted">
          {caption}
        </p>
        <p title={title} className="truncate text-sm font-semibold leading-snug text-text">
          {children}
        </p>
      </div>
    </div>
  );
}
