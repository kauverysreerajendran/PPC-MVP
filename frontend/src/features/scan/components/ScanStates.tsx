"use client";

import Link from "next/link";
import { ArrowRight, History, ScanLine, SearchX, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { SCAN_KIND_LABEL, type ScanKind } from "../detect";
import type { RecentScan } from "../store";
import { KIND_ICON, KindChip } from "./ScanBar";

/** Formats the detector reads, shown on the idle screen. */
const FORMATS: { kind: ScanKind; example: string }[] = [
  { kind: "box_uid", example: "BUID-0016" },
  { kind: "po", example: "PO-4500003096" },
  { kind: "dc", example: "DC-260920-17" },
  { kind: "location", example: "A1-S1-R2-T02" },
  { kind: "model", example: "90086" },
  { kind: "lot", example: "LOT-7013" },
];

function ago(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Nothing scanned yet: what can be scanned, and this session's scans. */
export function ScanIdle({
  recent,
  onRecall,
}: {
  recent: RecentScan[];
  onRecall: (scan: RecentScan) => void;
}) {
  return (
    <div className="ds-animate-fade grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-primary)_14%,transparent),transparent_70%)]"
        />
        <div className="relative">
          <span className="flex size-12 items-center justify-center rounded-[var(--radius-lg)] bg-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-surface-2))] text-primary">
            <ScanLine className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-text">Ready to scan</h2>
          <p className="mt-1 max-w-md text-sm text-text-secondary">
            Scan any label with the gun, or type a code and press Enter. The type is read from the
            code itself, and the result shows where the line is, its stage, quantities and
            documents.
          </p>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            What you can scan
          </p>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FORMATS.map((f) => {
              const Icon = KIND_ICON[f.kind];
              return (
                <li
                  key={f.kind}
                  className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2"
                >
                  <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="text-xs font-medium text-text">{SCAN_KIND_LABEL[f.kind]}</span>
                  <span className="ml-auto truncate font-mono text-xs text-text-muted">{f.example}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>

      <Card className="flex min-h-[240px] flex-col">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
          <History className="size-3.5 text-primary" aria-hidden />
          Recent scans
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
            <p className="text-sm font-medium text-text">No scans yet this session</p>
            <p className="mt-1 max-w-xs text-xs text-text-secondary">
              Everything you scan here is listed so you can reopen it in one click.
            </p>
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-border">
            {recent.map((r) => (
              <li key={`${r.kind}:${r.value}`}>
                <button
                  type="button"
                  onClick={() => onRecall(r)}
                  className="ds-focus-ring flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <KindChip kind={r.kind} muted />
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium text-text">
                    {r.value}
                  </span>
                  <span className="shrink-0 text-[11px] text-text-muted">
                    {r.found === 0 ? "no match" : r.found === 1 ? "1 line" : `${r.found} lines`}
                    {" · "}
                    {ago(r.at)}
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-text-muted" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** A panel-shaped placeholder of fixed height, so the result never jumps in. */
function PanelSkeleton({ height, rows = 3 }: { height: number; rows?: number }) {
  return (
    <Card className="overflow-hidden" style={{ minHeight: height }}>
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="space-y-3 p-4">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className={i === 0 ? "h-8 w-1/2" : "h-4"} />
        ))}
      </div>
    </Card>
  );
}

/** Resolving: the result's own two-column shape, in grey. */
export function ScanSkeleton() {
  return (
    <div aria-hidden className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <PanelSkeleton height={236} rows={4} />
        <PanelSkeleton height={196} />
        <PanelSkeleton height={148} rows={2} />
      </div>
      <div className="space-y-4">
        <PanelSkeleton height={220} />
        <PanelSkeleton height={356} rows={5} />
      </div>
    </div>
  );
}

const SUGGESTION: Record<ScanKind, string> = {
  box_uid: "Check the prefix and digits — Box UIDs read like BUID-0016 — or find the line on SAP Outward.",
  po: "Check the number — POs read like PO-4500003096 — or search SAP Outward; it may not have synced yet.",
  dc: "Check the number — DCs read like DC-260920-17 — or search SAP Outward; it may not have synced yet.",
  location: "Check the code — trays read rack · shelf · row · tray, like A1-S1-R2-T02 — or browse the Rack Locator.",
  sap_ref: "Check the prefix, or search SAP Outward for the line.",
  lot: "Check the prefix, or search SAP Outward for the lot.",
  model: "Check the number, or search SAP Outward for the model.",
  search: "Check the prefix, or search SAP Outward.",
};

export function ScanNotFound({
  value,
  kind,
  alternatives,
  onReadAs,
}: {
  value: string;
  kind: ScanKind;
  alternatives: ScanKind[];
  onReadAs: (kind: ScanKind) => void;
}) {
  const toRacks = kind === "location";
  return (
    <Card className="ds-animate-fade-up flex flex-col items-center px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-muted">
        <SearchX className="size-6" aria-hidden />
      </span>
      <h2 className="mt-4 text-base font-semibold text-text">
        Nothing matches <span className="font-mono">&lsquo;{value}&rsquo;</span>
      </h2>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary">
        Looked up as <KindChip kind={kind} />
      </p>
      <p className="mt-3 max-w-md text-sm text-text-secondary">{SUGGESTION[kind]}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {alternatives.map((k) => (
          <Button key={k} size="sm" variant="secondary" onClick={() => onReadAs(k)}>
            Try as {SCAN_KIND_LABEL[k]}
          </Button>
        ))}
        <Link
          href={toRacks ? "/rack-locator" : "/sap-outward"}
          className="ds-focus-ring inline-flex h-8 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-sm font-medium text-primary hover:underline"
        >
          {toRacks ? "Open Rack Locator" : "Search SAP Outward"}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

/** Every service the scan needed was unreachable. */
export function ScanFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card role="alert" className="ds-animate-fade-up flex flex-col items-center px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-[var(--color-danger-bg)] text-[var(--color-danger)]">
        <ServerCrash className="size-6" aria-hidden />
      </span>
      <h2 className="mt-4 text-base font-semibold text-text">Could not look that up</h2>
      <p className="mt-1 max-w-md text-sm text-text-secondary">{message}. Nothing was changed.</p>
      <Button size="sm" variant="secondary" className="mt-5" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  );
}
