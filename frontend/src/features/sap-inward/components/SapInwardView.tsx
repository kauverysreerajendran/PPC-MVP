"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  Calculator,
  CheckCheck,
  CornerDownLeft,
  MapPin,
  PackageCheck,
  RotateCcw,
  ScanLine,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { HoverCard } from "@/components/ui/HoverCard";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { WaveBanner } from "@/components/ui/WaveBanner";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/errors";
import { usePageSize } from "@/lib/usePageSize";
import { useSearchStore } from "@/stores/search";
import { useMdList } from "@/features/masterdata/hooks";
import type { SapInwardScanResult, SapOutward, Vendor } from "@/features/masterdata/types";
import {
  useInwardClose,
  useInwardLines,
  useInwardLookup,
  useInwardReset,
  useInwardScan,
  useInwardScans,
  useInwardVerify,
} from "../hooks";
import { useLineStatuses } from "@/features/status/hooks";
import type { InwardDocument } from "../documents";
import { fmtDate, fmtNum, INWARD_LABEL, INWARD_TONE } from "../utils/format";
import { ReceivingPanel } from "./ReceivingPanel";
import { VerifyInwardModal } from "./VerifyInwardModal";


/** One label / value line of the shortage calculation. */
function CalcRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-text-secondary">
        {label}
        {hint ? <span className="ml-1 text-[10px] text-text-muted">{hint}</span> : null}
      </dt>
      <dd className="font-medium tabular-nums text-text">{value}</dd>
    </div>
  );
}

/**
 * How the shortage of a line is worked out. Parts are whole: the lot is split
 * into `qty_per_piece` per piece with the first `extra_qty_pieces` pieces
 * carrying one more, so received / shortage are always whole numbers.
 */
function ShortageBreakdown({ row, onViewMore }: { row: SapOutward; onViewMore?: () => void }) {
  const lot = Number(row.quantity ?? 0);
  const expected = row.expected_pieces;
  const got = row.received_pieces;
  const base = Number(row.qty_per_piece ?? 0);
  const extra = row.extra_qty_pieces ?? 0;
  const received = Number(row.received_qty ?? 0);
  const rejected = Number(row.rejected_qty ?? 0);
  const short = Number(row.shortage_qty ?? 0);
  const extraReceived = Math.min(got, extra);
  // An accepted qty entered on this screen is not a multiple of the piece split.
  const enteredQty = base * got + extraReceived !== received;
  const receivedHow =
    got >= expected
      ? "all pieces in"
      : enteredQty
        ? "accepted qty entered"
        : `${got} × ${fmtNum(base)}${extraReceived ? ` + ${extraReceived}` : ""}`;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        <Calculator className="size-3.5 text-primary" />
        Shortage calculation
      </div>
      <dl className="divide-y divide-border">
        <CalcRow label="Lot quantity" value={fmtNum(lot)} />
        <CalcRow label="Expected pieces" hint="front + back = 1" value={String(expected)} />
        <CalcRow
          label="Parts per piece"
          hint={extra ? `first ${extra} carry ${fmtNum(base + 1)}` : undefined}
          value={fmtNum(base)}
        />
        <CalcRow label="Pieces received" value={`${got} / ${expected}`} />
        <CalcRow label="Received quantity" hint={receivedHow} value={fmtNum(received)} />
        {rejected > 0 ? <CalcRow label="QED rejected" value={fmtNum(rejected)} /> : null}
        <div className="flex items-baseline justify-between gap-3 pt-1.5">
          <dt className="font-semibold text-text">Shortage</dt>
          <dd
            className={cn(
              "font-semibold tabular-nums",
              short > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]",
            )}
          >
            {fmtNum(lot)} − {fmtNum(received)}
            {rejected > 0 ? ` − ${fmtNum(rejected)}` : ""} = {fmtNum(short)}
            <span className="ml-1 text-[10px] font-normal text-text-muted">
              ({Math.max(0, row.shortage_pieces)} pcs)
            </span>
          </dd>
        </div>
      </dl>
      {onViewMore ? (
        <button
          type="button"
          onClick={onViewMore}
          className="ds-focus-ring mt-2.5 inline-flex w-full items-center justify-center gap-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary"
        >
          View more
          <ArrowRight className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Full receiving detail of one outward line: identifiers, calculation, scans. */
function InwardDetailModal({
  row,
  vendorName,
  onClose,
}: {
  row: SapOutward | null;
  vendorName: Map<string, string>;
  onClose: () => void;
}) {
  const scans = useInwardScans(row?.id ?? null);
  if (!row) return null;
  const code = row.inward_status ?? "PENDING";
  const pct = row.expected_pieces
    ? Math.min(100, Math.round((row.received_pieces / row.expected_pieces) * 100))
    : 0;
  const fields: [string, string | null | undefined][] = [
    ["SAP reference", row.sap_reference_id],
    ["Date", fmtDate(row.transaction_date)],
    ["DC no", row.dc_no],
    ["PO no", row.po_no],
    ["Model", row.model_no],
    ["Vendor", row.vendor_code ? (vendorName.get(row.vendor_code) ?? row.vendor_code) : null],
    ["Batch no", row.batch_no],
    ["Lot no", row.lot_no],
    ["Box UID", row.box_uid],
    ["Tray type", row.tray_type],
    ["No. of trays", row.no_of_trays == null ? null : String(row.no_of_trays)],
    [
      "Front / back trays",
      row.front_case_trays == null && row.back_case_trays == null
        ? null
        : `${row.front_case_trays ?? "—"} / ${row.back_case_trays ?? "—"}`,
    ],
    ["Outward status", row.outward_status],
    [
      "Last scan",
      row.inward_last_scan_at ? new Date(row.inward_last_scan_at).toLocaleString() : null,
    ],
  ];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Receiving detail — ${row.box_uid ?? row.sap_reference_id}`}
      description={`PO ${row.po_no ?? "—"} · DC ${row.dc_no ?? "—"}`}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <StatusBadge label={INWARD_LABEL[code] ?? code} tone={INWARD_TONE[code] ?? "neutral"} />
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs tabular-nums text-text-secondary">
            {row.received_pieces}/{row.expected_pieces} pieces
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            {fields.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-text-secondary">{k}</dt>
                <dd className="truncate font-medium text-text">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-xs">
            <ShortageBreakdown row={row} />
          </div>
        </div>

        <div>
          <h3 className="mb-1.5 text-xs font-semibold text-text">Scan history</h3>
          <div className="max-h-56 overflow-auto rounded-[var(--radius-md)] border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2 text-text-secondary">
                <tr>
                  <th className="px-2 py-1.5 text-right font-medium">Piece</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                  <th className="px-2 py-1.5 text-left font-medium">Box UID</th>
                  <th className="px-2 py-1.5 text-left font-medium">Scanned by</th>
                  <th className="px-2 py-1.5 text-left font-medium">Scanned at</th>
                </tr>
              </thead>
              <tbody>
                {scans.isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-4 text-center text-text-muted">
                      Loading scans…
                    </td>
                  </tr>
                ) : (scans.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-4 text-center text-text-muted">
                      No scans recorded.
                    </td>
                  </tr>
                ) : (
                  [...(scans.data ?? [])]
                    .sort((a, b) => b.piece_no - a.piece_no)
                    .map((sc) => (
                      <tr key={sc.id} className="border-t border-border">
                        <td className="px-2 py-1.5 text-right tabular-nums">{sc.piece_no}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(sc.qty)}</td>
                        <td className="px-2 py-1.5 font-mono">{sc.box_uid ?? "—"}</td>
                        <td className="px-2 py-1.5">{sc.scanned_by ?? "—"}</td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {new Date(sc.scanned_at).toLocaleString()}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function SapInwardView() {
  const router = useRouter();
  const toast = useToast();
  const PAGE_SIZE = usePageSize();
  const [page, setPage] = useState(1);

  // Search is typed in the header bar (shared store), filtered server-side.
  const query = useSearchStore((s) => s.query);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => setPage(1), [search]);

  // Only lines a box has actually been scanned against — the grid is empty
  // until the operator starts scanning.
  const list = useInwardLines({
    page,
    page_size: PAGE_SIZE,
    ...(search ? { search } : {}),
  });

  // The latest state of each line this session has scanned — shown immediately
  // so a fresh scan lands in the grid without waiting for the list to refetch.
  const [scanned, setScanned] = useState<Record<string, SapOutward>>({});
  const rows = useMemo(() => {
    const byId = new Map<string, SapOutward>();
    for (const r of list.data?.items ?? []) byId.set(r.id, r);
    for (const r of Object.values(scanned)) byId.set(r.id, r); // fresher wins
    return [...byId.values()].sort((a, b) => {
      const ta = a.inward_last_scan_at ?? "";
      const tb = b.inward_last_scan_at ?? "";
      return tb.localeCompare(ta);
    });
  }, [list.data, scanned]);
  const total = Math.max(list.data?.total ?? 0, rows.length);
  // Verification (inward) and storage (rack) statuses come from the Status service.
  const lineStatus = useLineStatuses(rows.map((r) => r.sap_reference_id));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const vendorsList = useMdList<Vendor>("vendors", { page_size: 200 });
  const vendorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendorsList.data?.items ?? []) m.set(v.vendor_code, v.vendor_name);
    return m;
  }, [vendorsList.data]);

  // Line shown in the "View more" modal — kept fresh from the polled rows.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailRow = detailId ? (rows.find((r) => r.id === detailId) ?? null) : null;
  const closeDetail = useCallback(() => setDetailId(null), []);

  // Line shown in the Verification window — kept fresh from the polled rows.
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const verifyRow = verifyId ? (rows.find((r) => r.id === verifyId) ?? null) : null;
  const closeVerify = useCallback(() => setVerifyId(null), []);

  const lookup = useInwardLookup();
  const scan = useInwardScan();
  const reset = useInwardReset();
  const close = useInwardClose();
  const verify = useInwardVerify();

  const [scanValue, setScanValue] = useState("");
  const [lastScan, setLastScan] = useState<SapInwardScanResult | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  // Line fetched by the last scan, waiting for its quantities (step 2).
  const [receiving, setReceiving] = useState<SapOutward | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  // Step 1: a scan only fetches the box's outward line and documents.
  async function submitScan() {
    const box_uid = scanValue.trim();
    if (!box_uid) return;
    try {
      const line = await lookup.mutateAsync(box_uid);
      if (!line) {
        toast("error", `No outward line for Box UID '${box_uid}'.`);
        scanRef.current?.select();
        return;
      }
      setRecordError(null);
      setReceiving(line);
      setScanValue("");
    } catch (err) {
      toast("error", err instanceof ApiError ? err.displayMessage : "Could not fetch the box");
    }
  }

  // Step 2: record the accepted / QED-rejected quantities for that line.
  async function recordReceiving(accepted: number, rejected: number) {
    if (!receiving?.box_uid) return;
    setRecordError(null);
    try {
      const res = await scan.mutateAsync({
        box_uid: receiving.box_uid,
        accepted_qty: accepted,
        rejected_qty: rejected,
      });
      if (!res.matched || !res.outward) {
        setRecordError(res.message);
        return;
      }
      setLastScan(res);
      setScanned((prev) => ({ ...prev, [res.outward!.id]: res.outward! }));
      setReceiving(null);
      scanRef.current?.focus();
    } catch (err) {
      // Business conflicts stay on the form so the entered values are kept.
      if (err instanceof ApiError && (err.status === 409 || err.status === 422)) {
        setRecordError(err.displayMessage);
      } else {
        toast("error", err instanceof ApiError ? err.displayMessage : "Could not record the quantities");
      }
    }
  }

  const cancelReceiving = useCallback(() => {
    setReceiving(null);
    setRecordError(null);
    scanRef.current?.focus();
  }, []);

  async function onReset(row: SapOutward) {
    try {
      await reset.mutateAsync(row.id);
      toast("success", `${row.box_uid ?? "line"} receiving cleared`);
      if (lastScan?.outward?.id === row.id) setLastScan(null);
      setScanned((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    } catch {
      toast("error", "Could not reset");
    }
  }

  // Verify opens the Verification window; the status changes only on Confirm.
  function onVerify(row: SapOutward) {
    setVerifyId(row.id);
  }

  async function onConfirmVerify(row: SapOutward, documents: InwardDocument[]) {
    try {
      await verify.mutateAsync({ outwardId: row.id, documents });
      setVerifyId(null);
      toast("success", "Moving to rack placement");
    } catch (err) {
      toast("error", err instanceof ApiError ? err.displayMessage : "Could not verify");
    }
  }

  async function onClose(row: SapOutward) {
    try {
      const out = await close.mutateAsync(row.id);
      setScanned((prev) => ({ ...prev, [out.id]: out }));
      toast(
        out.inward_status === "SHORT" ? "error" : "success",
        out.inward_status === "SHORT"
          ? `Closed SHORT — ${fmtNum(out.shortage_qty)} missing`
          : "Line received in full",
      );
    } catch {
      toast("error", "Could not close");
    }
  }

  const columns: Column<SapOutward>[] = useMemo(() => {
    const serialBase = (page - 1) * PAGE_SIZE;
    return [
      {
        key: "__serial",
        header: "S.No",
        align: "right",
        render: (_r: SapOutward) => serialBase + rows.indexOf(_r) + 1,
      },
      {
        key: "transaction_date",
        header: "Date",
        render: (r) => fmtDate(r.transaction_date),
      },
      { key: "dc_no", header: "DC no", render: (r) => r.dc_no ?? "—" },
      { key: "po_no", header: "PO no", render: (r) => r.po_no ?? "—" },
      {
        key: "model_no",
        header: "Model",
        render: (r) =>
          r.model_no ? <span className="ds-chip">{r.model_no}</span> : "—",
      },
      {
        key: "vendor",
        header: "Vendor",
        render: (r) => {
          const name = r.vendor_code ? vendorName.get(r.vendor_code) : null;
          return name ?? <span className="text-text-muted">—</span>;
        },
      },
      { key: "batch_no", header: "Batch no", render: (r) => r.batch_no ?? "—" },
      {
        key: "box_uid",
        header: "Box UID",
        render: (r) =>
          r.box_uid ? (
            <span className="ds-chip ds-chip-0 font-mono">{r.box_uid}</span>
          ) : (
            <span className="text-text-muted">—</span>
          ),
      },
      {
        key: "quantity",
        header: "Lot Qty",
        align: "right",
        render: (r) => fmtNum(r.quantity),
      },
      {
        key: "received_qty",
        header: "Received",
        align: "right",
        render: (r) => (
          <span
            className={cn(
              "tabular-nums",
              r.received_pieces > 0 ? "text-text" : "text-text-muted",
            )}
          >
            {fmtNum(r.received_qty ?? 0)}
          </span>
        ),
      },
      {
        key: "shortage",
        header: "Shortage",
        align: "right",
        render: (r) => {
          const short = Number(r.shortage_qty ?? 0);
          if (!r.received_pieces && r.inward_status !== "SHORT")
            return <span className="text-text-muted">—</span>;
          return (
            <HoverCard
              label={`Shortage calculation for ${r.box_uid ?? r.sap_reference_id}`}
              trigger={
                <span
                  className={cn(
                    "inline-flex items-center gap-1 tabular-nums",
                    short > 0
                      ? "font-medium text-[var(--color-danger)]"
                      : "text-[var(--color-success)]",
                  )}
                >
                  {short > 0 ? <TriangleAlert className="size-3" /> : null}
                  {fmtNum(r.shortage_qty)}
                </span>
              }
            >
              {(close) => (
                <ShortageBreakdown
                  row={r}
                  onViewMore={() => {
                    close();
                    setDetailId(r.id);
                  }}
                />
              )}
            </HoverCard>
          );
        },
      },
      {
        key: "verify_status",
        header: "Status",
        render: (r) => {
          const st = lineStatus.statusOf(r.sap_reference_id, "inward");
          return st ? (
            <StatusBadge label={st.label} tone={st.tone} />
          ) : (
            <span className="text-text-muted">—</span>
          );
        },
      },
      {
        key: "rack",
        header: "Location",
        render: (r) => {
          const rackStatus = lineStatus.statusOf(r.sap_reference_id, "rack");
          if (rackStatus?.code === "PLACED") {
            return <StatusBadge label={rackStatus.label} tone={rackStatus.tone} />;
          }
          const enabled = r.received_pieces > 0;
          return (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!enabled}
                onClick={() => router.push(`/rack-locator?place=${encodeURIComponent(r.id)}`)}
                className="ds-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border-strong disabled:hover:text-text-secondary"
                title={enabled ? "Place the received pieces in rack trays" : "Enter accepted qty first"}
              >
                <MapPin className="size-3" />
                Place in rack
              </button>
              {rackStatus && rackStatus.code !== "NOT_PLACED" ? (
                <StatusBadge label={rackStatus.label} tone={rackStatus.tone} />
              ) : null}
            </div>
          );
        },
      },
      {
        key: "actions",
        header: "",
        align: "right",
        render: (r) => (
          <div className="flex items-center justify-end gap-1">
            {lineStatus.statusOf(r.sap_reference_id, "inward")?.code === "YET_TO_VERIFY" ? (
              <button
                type="button"
                onClick={() => onVerify(r)}
                title="Checked the received quantities — mark this line Verified"
                className="ds-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--color-success)_40%,transparent)] bg-[var(--color-success-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-success)] transition-colors hover:border-[var(--color-success)]"
              >
                <CheckCheck className="size-3.5" />
                Verify
              </button>
            ) : null}
            {r.received_pieces > 0 && r.inward_status === "PARTIAL" ? (
              <button
                type="button"
                onClick={() => onClose(r)}
                title="Finalise receiving (mark short if incomplete)"
                className="ds-focus-ring rounded p-1 text-text-muted hover:bg-surface-2 hover:text-[var(--color-success)]"
              >
                <PackageCheck className="size-4" />
              </button>
            ) : null}
            {r.received_pieces > 0 || r.inward_status ? (
              <button
                type="button"
                onClick={() => onReset(r)}
                title="Clear receiving for this line"
                className="ds-focus-ring rounded p-1 text-text-muted hover:bg-surface-2 hover:text-text"
              >
                <RotateCcw className="size-4" />
              </button>
            ) : null}
          </div>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, vendorName, page, PAGE_SIZE, lineStatus.statusOf]);

  return (
    <>
      <WaveBanner
        breadcrumb={[{ label: "SAP Inward" }, { label: "Receiving" }]}
        title="SAP Inward"
        subtitle="Scan received boxes to verify each lot and record any shortage."
        actions={
          // Scanner console: icon badge + labelled input + primary action in one
          // glassy bar. The "ready" dot pulses while the input has focus.
          <div className="group flex items-center gap-2 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-primary)_26%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-surface)_94%,transparent)] p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-16px_color-mix(in_srgb,var(--color-primary)_65%,transparent)] backdrop-blur-sm transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_16%,transparent),0_12px_28px_-16px_color-mix(in_srgb,var(--color-primary)_65%,transparent)]">
            <label className="flex cursor-text items-center gap-2.5 pl-1 pr-2">
              <span className="relative flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-gradient-to-br from-primary to-[var(--color-teal-700)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_6px_-2px_color-mix(in_srgb,var(--color-primary)_70%,transparent)]">
                <ScanLine className="size-4" />
                <span className="absolute -right-0.5 -top-0.5 flex size-2">
                  <span className="absolute inline-flex size-full rounded-full bg-[var(--color-success)] opacity-0 group-focus-within:animate-ping group-focus-within:opacity-70" />
                  <span className="relative inline-flex size-2 rounded-full bg-text-muted ring-2 ring-surface group-focus-within:bg-[var(--color-success)]" />
                </span>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.09em] text-primary">
                  Scan a Box UID
                </span>
                <input
                  ref={scanRef}
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitScan();
                  }}
                  placeholder="e.g. BUID-0102"
                  title="Scan a box to fetch its outward documents, then enter the accepted qty"
                  className="h-5 w-44 bg-transparent font-mono text-[13px] font-medium tracking-wide text-text outline-none placeholder:font-normal placeholder:text-text-muted"
                />
              </span>
            </label>
            <span
              aria-hidden
              className="h-7 w-px shrink-0 bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-border))]"
            />
            <Button
              size="sm"
              loading={lookup.isPending}
              onClick={submitScan}
              className="h-9 gap-1.5 rounded-[var(--radius-md)] px-3.5 shadow-sm"
            >
              <PackageCheck className="size-4" />
              Fetch Box
              <kbd className="ml-0.5 hidden items-center rounded-[var(--radius-xs)] border border-current/30 px-1 py-px opacity-80 sm:inline-flex">
                <CornerDownLeft className="size-3" />
              </kbd>
            </Button>
          </div>
        }
      />

      {receiving ? (
        <ReceivingPanel
          key={receiving.id}
          line={receiving}
          vendorName={receiving.vendor_code ? (vendorName.get(receiving.vendor_code) ?? null) : null}
          pending={scan.isPending}
          serverError={recordError}
          onRecord={(a, r) => void recordReceiving(a, r)}
          onCancel={cancelReceiving}
        />
      ) : null}

      {/* last scan result — one compact line under the banner */}
      {lastScan ? (
        <div
          className={cn(
            "mb-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[var(--radius-md)] border px-3 py-1.5 text-xs",
            lastScan.matched
              ? "border-[color-mix(in_srgb,var(--color-primary)_30%,transparent)] bg-teal-50 dark:bg-[#12333a]"
              : "border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[var(--color-danger-bg)]",
          )}
        >
          <Boxes
            className={cn(
              "size-3.5 shrink-0",
              lastScan.matched ? "text-primary" : "text-[var(--color-danger)]",
            )}
          />
          <span className="font-medium text-text">{lastScan.message}</span>
          {lastScan.outward ? (
            <span className="tabular-nums text-text-secondary">
              {lastScan.outward.box_uid} · PO {lastScan.outward.po_no} · DC{" "}
              {lastScan.outward.dc_no} · piece{" "}
              {lastScan.outward.received_pieces}/{lastScan.outward.expected_pieces}
              {" · "}
              received {fmtNum(lastScan.outward.received_qty)} of{" "}
              {fmtNum(lastScan.outward.quantity)}
            </span>
          ) : null}
        </div>
      ) : null}

      <DataTable<SapOutward>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        headerVariant="solid"
        columnDividers
        stickyHeader={false}
        emptyContent={
          search ? (
            <div className="px-6 py-14 text-center text-sm text-text-secondary">
              No scanned lines match “{search}”.
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-primary)_10%,var(--color-surface-2))] text-primary">
                <ScanLine className="size-5" />
              </div>
              <h3 className="text-sm font-semibold text-text">Nothing received yet</h3>
              <p className="mt-1 max-w-sm text-xs text-text-secondary">
                Scan a Box UID above. The lot it belongs to appears here and its
                shortage is tracked as you keep scanning.
              </p>
            </div>
          )
        }
        footer={
          <Pagination
            page={page}
            pages={pages}
            total={total}
            size={PAGE_SIZE}
            onPageChange={(p) => setPage(Math.min(Math.max(1, p), pages))}
          />
        }
      />

      <InwardDetailModal row={detailRow} vendorName={vendorName} onClose={closeDetail} />
      <VerifyInwardModal
        row={verifyRow}
        vendorName={vendorName}
        pending={verify.isPending}
        onConfirm={onConfirmVerify}
        onClose={closeVerify}
      />
    </>
  );
}
