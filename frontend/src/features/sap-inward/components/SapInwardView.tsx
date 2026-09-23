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
  // RotateCcw, // TEMP: Clear-receiving action hidden on request
  ScanLine,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { HoverCard } from "@/components/ui/HoverCard";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TableTabs } from "@/components/ui/TableTabs";
import { useToast } from "@/components/ui/Toast";
import { WaveBanner } from "@/components/ui/WaveBanner";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/errors";
import { usePageSize } from "@/lib/usePageSize";
import { useSearchStore } from "@/stores/search";
import { patchOutwardByRef } from "@/features/masterdata/api";
import { useMdList } from "@/features/masterdata/hooks";
import type { Box, SapInwardScanResult, SapOutward, Vendor } from "@/features/masterdata/types";
import {
  // useInwardClose, // TEMP: Finalise-receiving action hidden on request
  useInwardDocumentLookup,
  useInwardLines,
  useInwardLookup,
  // useInwardReset, // TEMP: Clear-receiving action hidden on request
  useInwardScan,
  useInwardScans,
  useInwardVerify,
  useScannedInwardLines,
} from "../hooks";
import { detectScan } from "@/features/scan/detect";
import { useSapRecords } from "@/features/sap/hooks";
import { statusApi } from "@/features/status/api";
import { useLineStatuses } from "@/features/status/hooks";
import {
  SHOW_STARTED_WITHOUT_SCAN,
  matchesInwardSearch,
  scanRefusal,
  useScannedInward,
} from "../scanned";
import type { InwardDocument } from "../documents";
import { fmtDate, fmtNum, INWARD_LABEL, INWARD_TONE } from "../utils/format";
import { ReceivingPanel } from "./ReceivingPanel";
import { VerifyInwardModal } from "./VerifyInwardModal";


/**
 * Main Table = the lines whose Box UID was scanned at this station this
 * session (newest first) — plus, while `SHOW_STARTED_WITHOUT_SCAN` is on, the
 * lines whose rack placement is already under way, under their own heading.
 * Nothing is listed just for being dispatched: SAP Outward makes a line
 * scannable, the scan brings it here. A scanned line stays until it is fully
 * placed (it is then on the Complete Table) or the operator clears the set.
 *
 * Complete Table = lines whose received pieces are all placed in rack trays —
 * a record, read from `GET /sap-inward/lines?stage=received` as before.
 */
type InwardTab = "pending" | "received";

/** Ties the scan console's message to its input for assistive tech. */
const SCAN_ERROR_ID = "sap-inward-scan-error";

const STARTED_HEADING = "In progress (not scanned this session)";
const SCANNED_HEADING = "Scanned this session";

/** A line's current rack status code, or null when the Status service can't say. */
async function rackCodeOf(ref: string): Promise<string | null> {
  try {
    const page = await statusApi.lines({ refs: ref, stage: "rack", page_size: 1 });
    return page.items[0]?.code ?? null;
  } catch {
    return null;
  }
}

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

/**
 * Box UID cell of a line that has none yet. "Set Box UID" opens an inline
 * field; saving assigns the box and goes straight on to the accepted-quantity
 * form, so one interaction covers both. A line that already carries a UID
 * renders the plain chip, unchanged.
 */
function BoxUidCell({
  value,
  known,
  enforce,
  onSave,
}: {
  value: string | null;
  known: ReadonlySet<string>;
  /** only reject an unknown UID while the whole box master is in hand */
  enforce: boolean;
  onSave: (uid: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (value) return <span className="ds-chip ds-chip-0 font-mono">{value}</span>;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft("");
          setError(null);
          setEditing(true);
        }}
        title="Assign a Box UID and enter the accepted quantity"
        className="ds-focus-ring rounded-[var(--radius-sm)] border border-dashed border-border-strong px-2 py-0.5 text-xs font-medium text-text-muted transition-colors hover:border-primary hover:text-primary"
      >
        Set Box UID
      </button>
    );
  }

  async function commit() {
    const uid = draft.trim().toUpperCase();
    if (!uid) {
      setError("Scan or type a Box UID");
      return;
    }
    if (enforce && !known.has(uid)) {
      setError("Invalid Box UID");
      return;
    }
    setSaving(true);
    try {
      await onSave(uid);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : "Could not save the box");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <input
        autoFocus
        value={draft}
        disabled={saving}
        aria-label="Box UID"
        placeholder="BUID-0001"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setError(null);
          setDraft(e.target.value.toUpperCase());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={() => {
          if (!draft.trim() && !saving) setEditing(false);
        }}
        className={cn(
          "h-6 w-28 rounded-[var(--radius-sm)] border bg-surface px-1.5 font-mono text-xs outline-none",
          error
            ? "border-[var(--color-danger)] text-[var(--color-danger)]"
            : "border-border-strong text-text focus:border-primary",
        )}
      />
      {error ? (
        <span className="text-[10px] leading-none text-[var(--color-danger)]">{error}</span>
      ) : null}
    </span>
  );
}

export function SapInwardView() {
  const router = useRouter();
  const toast = useToast();
  const PAGE_SIZE = usePageSize();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<InwardTab>("pending");

  // Search is typed in the header bar (shared store), filtered server-side.
  const query = useSearchStore((s) => s.query);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => setPage(1), [search, tab]);

  // Main Table: the lines scanned here this session, kept live by polling
  // exactly those references, plus the placement-started group. There is no
  // "every dispatched line" worklist request.
  const scannedLines = useScannedInward((s) => s.lines);
  const addScanned = useScannedInward((s) => s.add);
  const updateScanned = useScannedInward((s) => s.update);
  const removeScanned = useScannedInward((s) => s.remove);
  const clearScanned = useScannedInward((s) => s.clear);
  const scannedRefs = useMemo(() => scannedLines.map((x) => x.ref), [scannedLines]);
  const scannedLive = useScannedInwardLines(scannedRefs);
  const startedList = useInwardLines(
    { page: 1, page_size: 200, stage: "pending", started: true },
    { enabled: SHOW_STARTED_WITHOUT_SCAN },
  );
  // Complete Table: placed lines, paged server-side. On the Main tab only its
  // total is needed, for the badge — a separate query, so the one-row count
  // is never shown as the list while it loads.
  const complete = useInwardLines(
    { page, page_size: PAGE_SIZE, stage: "received", ...(search ? { search } : {}) },
    { enabled: tab === "received" },
  );
  const completeCount = useInwardLines(
    { page: 1, page_size: 1, stage: "received", ...(search ? { search } : {}) },
    { enabled: tab === "pending" },
  );

  // The latest state of each line this session has recorded against — merged
  // over the fetched rows so a fresh entry shows its quantities at once,
  // without waiting for a refetch. It never MOVES a row: only a rack placement
  // does that, and that happens on the Rack Locator.
  const [fresh, setFresh] = useState<Record<string, SapOutward>>({});

  // Scanned rows first (newest scan on top), then the started group; the
  // header search filters both.
  const { mainRows, startedIds } = useMemo(() => {
    const live = new Map((scannedLive.data?.items ?? []).map((r) => [r.id, r]));
    const scannedIds = new Set(scannedLines.map((x) => x.id));
    const scannedRows = scannedLines.map((x) => fresh[x.id] ?? live.get(x.id) ?? x.line);
    const startedRows = (startedList.data?.items ?? [])
      .filter((r) => !scannedIds.has(r.id))
      .map((r) => fresh[r.id] ?? r);
    return {
      mainRows: [...scannedRows, ...startedRows].filter((r) => matchesInwardSearch(r, search)),
      startedIds: new Set(startedRows.map((r) => r.id)),
    };
  }, [scannedLive.data, scannedLines, startedList.data, fresh, search]);

  const total = tab === "pending" ? mainRows.length : (complete.data?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const shownPage = Math.min(page, pages);
  const rows = useMemo(
    () =>
      tab === "pending"
        ? mainRows.slice((shownPage - 1) * PAGE_SIZE, shownPage * PAGE_SIZE)
        : (complete.data?.items ?? []).map((r) => fresh[r.id] ?? r), // fresher wins, in place
    [tab, mainRows, shownPage, PAGE_SIZE, complete.data, fresh],
  );
  // Each badge counts what its tab actually shows.
  const tabTotals: Record<InwardTab, number | undefined> = {
    pending: mainRows.length,
    received: tab === "received" ? complete.data?.total : completeCount.data?.total,
  };
  // Verification (inward) and storage (rack) statuses come from the Status service.
  const lineStatus = useLineStatuses(rows.map((r) => r.sap_reference_id));

  // The SAP feed's own record for each visible line. A masterdata line created
  // before the vendor was carried across has none of its own, and the vendor is
  // on the feed record either way — so the column reads it from here when the
  // line itself cannot say. One request for the page, not one per row.
  const feedRefs = useMemo(
    () => [...new Set(rows.map((r) => r.sap_reference_id))].join(","),
    [rows],
  );
  const feedRecords = useSapRecords(
    { page: 1, page_size: 200, refs: feedRefs },
    { enabled: feedRefs.length > 0 },
  );
  const feedVendorCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of feedRecords.data?.items ?? []) {
      if (r.vendor_code) m.set(r.sap_reference_id, r.vendor_code);
    }
    return m;
  }, [feedRecords.data]);

  // A scanned line that is now fully placed has crossed to the Complete Table,
  // so it leaves the scanned set.
  const { statusOf: scannedStatusOf } = useLineStatuses(scannedRefs);
  useEffect(() => {
    const placed = scannedLines
      .filter((x) => scannedStatusOf(x.ref, "rack")?.code === "PLACED")
      .map((x) => x.id);
    if (placed.length) removeScanned(placed);
  }, [scannedLines, scannedStatusOf, removeScanned]);
  const hasStarted = mainRows.some((r) => startedIds.has(r.id));

  // Box master — a Box UID assigned here must be one that exists, exactly as
  // it had to on SAP Outward.
  const boxesList = useMdList<Box>("boxes", { page_size: 200, page: 1 });
  const availableBoxUids = useMemo(() => {
    const s = new Set<string>();
    for (const b of boxesList.data?.items ?? []) {
      if (b.status === "active") s.add(b.box_uid);
    }
    return s;
  }, [boxesList.data]);
  // An unknown UID may only be refused here while the whole master is in hand;
  // otherwise it goes to the service, which holds the real rule.
  const boxesComplete =
    !!boxesList.data && boxesList.data.items.length >= (boxesList.data.total ?? 0);

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
  const docLookup = useInwardDocumentLookup();
  const scan = useInwardScan();
  // TEMP (hidden on request): Finalise / Clear receiving actions.
  // const reset = useInwardReset();
  // const close = useInwardClose();
  const verify = useInwardVerify();

  const [scanValue, setScanValue] = useState("");
  const [lastScan, setLastScan] = useState<SapInwardScanResult | null>(null);
  /** Unknown / rejected Box UID, shown in the console itself, not only a toast. */
  const [scanError, setScanError] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  // Line fetched by the last scan, waiting for its quantities (step 2).
  const [receiving, setReceiving] = useState<SapOutward | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  // Step 1: a scan fetches the box's outward line and documents, and brings the
  // line onto the Main Table. Works from either tab.
  const startReceiving = useCallback((line: SapOutward) => {
    setScanError(null);
    setRecordError(null);
    setReceiving(line);
    setScanValue("");
  }, []);

  /**
   * What was scanned is read from its shape (`features/scan/detect.ts`), so the
   * operator never picks a type first:
   *
   *   Box UID  → its one line comes on and the receiving form opens. Unchanged.
   *   DC / PO  → every line on that document comes onto the Main Table and the
   *              operator hits Scan / Receive on the box actually in hand. A
   *              document names many lines, so opening a form for one of them
   *              would be a guess.
   *
   * Lines a Box UID scan would have refused (not dispatched, already placed)
   * are left out of a document scan too — the same `scanRefusal` rule.
   */
  async function submitScan(uid?: string) {
    const raw = (uid ?? scanValue).trim();
    if (!raw) {
      setScanError("Scan or type a Box UID, DC or PO");
      return;
    }
    const { value, kind } = detectScan(raw);
    if (kind !== "box_uid" && kind !== "dc" && kind !== "po") {
      setScanValue(value);
      setScanError(`'${value}' is not a Box UID, DC or PO`);
      scanRef.current?.select();
      return;
    }

    try {
      if (kind === "box_uid") {
        const line = await lookup.mutateAsync(value);
        // Unknown, not dispatched, or already placed: refused with the reason,
        // and no row is added.
        const refusal = scanRefusal(
          value,
          line,
          line ? await rackCodeOf(line.sap_reference_id) : null,
        );
        if (refusal || !line) {
          setScanValue(value);
          setScanError(refusal);
          scanRef.current?.focus();
          scanRef.current?.select();
          return;
        }
        addScanned(line);
        setTab("pending");
        startReceiving(line);
        return;
      }

      const field = kind === "dc" ? "dc_no" : "po_no";
      const lines = await docLookup.mutateAsync({ field, value });
      if (lines.length === 0) {
        setScanValue(value);
        setScanError(`No line found for '${value}'`);
        scanRef.current?.select();
        return;
      }
      // A document scan does not require a prior dispatch the way a Box UID
      // scan does — the line may have been created by this very lookup. The
      // one thing that still rules a line out is its pieces already sitting in
      // a rack, which is the second half of `scanRefusal`.
      const rackCodes = await Promise.all(
        lines.map((l) => rackCodeOf(l.sap_reference_id)),
      );
      const ready = lines.filter((_, i) => rackCodes[i] !== "PLACED");
      if (ready.length === 0) {
        setScanValue(value);
        setScanError(
          `${lines.length} line${lines.length === 1 ? "" : "s"} on '${value}', all already placed`,
        );
        scanRef.current?.select();
        return;
      }
      for (const l of ready) addScanned(l);
      setTab("pending");
      setScanValue("");
      setScanError(null);
      toast(
        "success",
        ready.length === lines.length
          ? `${value} — ${ready.length} line${ready.length === 1 ? "" : "s"} added`
          : `${value} — ${ready.length} of ${lines.length} lines added, the rest are not ready`,
      );
      scanRef.current?.focus();
    } catch (err) {
      setScanError(
        err instanceof ApiError ? err.displayMessage : "Could not fetch the scan",
      );
    }
  }

  /**
   * Assign a Box UID to a line brought on by a DC / PO scan, then open the
   * accepted-quantity form for it. Masterdata owns the outward status — this
   * screen only supplies the box, exactly as the SAP Outward cell did.
   */
  async function saveInwardBoxUid(row: SapOutward, uid: string) {
    await patchOutwardByRef(row.sap_reference_id, { box_uid: uid });
    const next = { ...row, box_uid: uid };
    updateScanned(next);
    setFresh((prev) => ({ ...prev, [row.id]: next }));
    startReceiving(next);
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
      setFresh((prev) => ({ ...prev, [res.outward!.id]: res.outward! }));
      updateScanned(res.outward);
      setReceiving(null);
      // The line stays where it is: the Main Table row is updated in place with
      // the quantities just recorded. It crosses to the Complete Table only
      // once its received pieces are placed in a rack.
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

  // TEMP (hidden on request): Clear receiving.
//   async function onReset(row: SapOutward) {
//     try {
//       await reset.mutateAsync(row.id);
//       toast("success", `${row.box_uid ?? "line"} receiving cleared`);
//       if (lastScan?.outward?.id === row.id) setLastScan(null);
//       setFresh((prev) => {
//         const next = { ...prev };
//         delete next[row.id];
//         return next;
//       });
//     } catch {
//       toast("error", "Could not reset");
//     }
//   }

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

  // TEMP (hidden on request): Finalise receiving.
//   async function onClose(row: SapOutward) {
//     try {
//       const out = await close.mutateAsync(row.id);
//       setFresh((prev) => ({ ...prev, [out.id]: out }));
//       updateScanned(out);
//       toast(
//         out.inward_status === "SHORT" ? "error" : "success",
//         out.inward_status === "SHORT"
//           ? `Closed SHORT — ${fmtNum(out.shortage_qty)} missing`
//           : "Line received in full",
//       );
//     } catch {
//       toast("error", "Could not close");
//     }
//   }

  /**
   * One column set for both tabs. The Main Table holds lines at every stage
   * before placement — nothing received, received, verified — so it renders the
   * receiving data whenever there is any and "—" where there is none; the
   * Complete Table's rows all have it.
   */
  const inwardColumns: Column<SapOutward>[] = useMemo(() => {
    const serialBase = (shownPage - 1) * PAGE_SIZE;
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
          // The line's own vendor, or the SAP feed's when the line has none.
          const code = r.vendor_code ?? feedVendorCode.get(r.sap_reference_id) ?? null;
          if (!code) return <span className="text-text-muted">—</span>;
          // The master's name when it has one, else the code itself — a line
          // carrying a vendor should never read as having none.
          return <>{vendorName.get(code) ?? code}</>;
        },
      },
      { key: "batch_no", header: "Batch no", render: (r) => r.batch_no ?? "—" },
      {
        key: "box_uid",
        header: "Box UID",
        render: (r) => (
          <BoxUidCell
            value={r.box_uid ?? null}
            known={availableBoxUids}
            enforce={boxesComplete}
            onSave={(uid) => saveInwardBoxUid(r, uid)}
          />
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
        // The Main Table now holds lines with nothing received yet as well —
        // those show "—", not a misleading 0.
        render: (r) =>
          r.received_pieces > 0 || r.inward_status ? (
            <span className="tabular-nums text-text">{fmtNum(r.received_qty ?? 0)}</span>
          ) : (
            <span className="text-text-muted">—</span>
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
          const scannedAt = r.inward_last_scan_at ? (
            <span className="text-[10px] leading-none text-text-muted">
              {fmtDate(r.inward_last_scan_at)}
            </span>
          ) : null;
          // Receiving progress comes from the line itself: `inward_status` is
          // what the accepted-quantity entry writes, so the cell turns
          // Received (or Receiving / Short) the moment the form is submitted,
          // without waiting on the Status service to be re-read.
          if (r.inward_status) {
            return (
              <span className="-my-0.5 inline-flex flex-col items-start gap-0.5">
                <StatusBadge
                  label={INWARD_LABEL[r.inward_status] ?? r.inward_status}
                  tone={INWARD_TONE[r.inward_status] ?? "neutral"}
                />
                {scannedAt}
              </span>
            );
          }
          // No quantities recorded yet. A line is only on this table because
          // it was scanned in at the station, so the consignment is physically
          // here — it reads Received. What is still outstanding is the count,
          // which the Received / Shortage columns and the Verify step show.
          return (
            <span className="-my-0.5 inline-flex flex-col items-start gap-0.5">
              <StatusBadge label="Received" tone="success" />
              {scannedAt}
            </span>
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
            {r.received_pieces === 0 && !r.inward_status ? (
              <button
                type="button"
                disabled={!r.box_uid}
                onClick={() => void submitScan(r.box_uid ?? "")}
                title={
                  r.box_uid
                    ? `Receive box ${r.box_uid}`
                    : "This line has no Box UID — dispatch it on SAP Outward first"
                }
                className="ds-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ScanLine className="size-3" />
                Scan / Receive
              </button>
            ) : null}
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
            {/* TEMP (hidden on request): Finalise receiving (PackageCheck) and
                Clear receiving (RotateCcw). Restore together with onClose /
                onReset and the useInwardClose / useInwardReset hooks.
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
            */}
          </div>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rows,
    vendorName,
    feedVendorCode,
    shownPage,
    PAGE_SIZE,
    lineStatus.statusOf,
    availableBoxUids,
    boxesComplete,
  ]);

  const columns = inwardColumns;

  return (
    <>
      <WaveBanner
        breadcrumb={[{ label: "SAP Inward" }, { label: "Receiving" }]}
        title="SAP Inward"
        actions={
          // Scanner console: icon badge + labelled input + primary action in one
          // glassy bar. The "ready" dot pulses while the input has focus, and a
          // rejected Box UID turns the bar red with the reason under it.
          <div className="flex flex-col items-stretch gap-1">
            <div
              className={cn(
                "group flex items-center gap-2 rounded-[var(--radius-lg)] border bg-[color-mix(in_srgb,var(--color-surface)_94%,transparent)] p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-16px_color-mix(in_srgb,var(--color-primary)_65%,transparent)] backdrop-blur-sm transition-[border-color,box-shadow]",
                scanError
                  ? "border-[var(--color-danger)]"
                  : "border-[color-mix(in_srgb,var(--color-primary)_26%,var(--color-border))] focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_16%,transparent),0_12px_28px_-16px_color-mix(in_srgb,var(--color-primary)_65%,transparent)]",
              )}
            >
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
                    Scan a Box UID, DC or PO
                  </span>
                  <input
                    ref={scanRef}
                    value={scanValue}
                    aria-invalid={scanError ? true : undefined}
                    aria-describedby={scanError ? SCAN_ERROR_ID : undefined}
                    onChange={(e) => {
                      setScanError(null);
                      setScanValue(e.target.value.toUpperCase());
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitScan();
                    }}
                    placeholder="BUID-0102 / DC-260923-13 / PO-45…"
                    title="Scan a dispatched box to bring its line onto the Main Table, or a DC / PO to bring every line on that document"
                    className={cn(
                      "h-5 w-44 bg-transparent font-mono text-[13px] font-medium tracking-wide outline-none placeholder:font-normal placeholder:text-text-muted",
                      scanError ? "text-[var(--color-danger)]" : "text-text",
                    )}
                  />
                </span>
              </label>
              <span
                aria-hidden
                className="h-7 w-px shrink-0 bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-border))]"
              />
              <Button
                size="sm"
                loading={lookup.isPending || docLookup.isPending}
                onClick={() => void submitScan()}
                className="h-9 gap-1.5 rounded-[var(--radius-md)] px-3.5 shadow-sm"
              >
                <PackageCheck className="size-4" />
                Fetch Box
                <kbd className="ml-0.5 hidden items-center rounded-[var(--radius-xs)] border border-current/30 px-1 py-px opacity-80 sm:inline-flex">
                  <CornerDownLeft className="size-3" />
                </kbd>
              </Button>
            </div>
            {scanError ? (
              <span
                id={SCAN_ERROR_ID}
                role="alert"
                className="px-1 text-[11px] font-medium text-[var(--color-danger)]"
              >
                {scanError}
              </span>
            ) : null}
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
        loading={
          tab === "pending"
            ? SHOW_STARTED_WITHOUT_SCAN && startedList.isLoading && scannedLines.length === 0
            : complete.isLoading
        }
        error={
          tab === "pending"
            ? startedList.isError && scannedLines.length === 0
            : complete.isError
        }
        onRetry={() => void (tab === "pending" ? startedList.refetch() : complete.refetch())}
        headerVariant="solid"
        columnDividers
        stickyHeader={false}
        groupLabel={
          tab === "pending"
            ? (r, i) => {
                const started = startedIds.has(r.id);
                const prev = i > 0 ? rows[i - 1] : undefined;
                if (started && (!prev || !startedIds.has(prev.id))) return STARTED_HEADING;
                if (!started && i === 0 && hasStarted) return SCANNED_HEADING;
                return null;
              }
            : undefined
        }
        toolbar={
          <>
            <TableTabs<InwardTab>
              label="Inward lines"
              value={tab}
              onChange={setTab}
              tabs={[
                { key: "pending", label: "Main Table", count: tabTotals.pending },
                { key: "received", label: "Complete Table", count: tabTotals.received },
              ]}
            />
            {tab === "pending" && scannedLines.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  clearScanned();
                  scanRef.current?.focus();
                }}
                title="Take the lines scanned this session off the Main Table — nothing on the lines changes"
                className="ds-focus-ring ml-auto inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary"
              >
                <X className="size-3.5" />
                Clear scanned
              </button>
            ) : null}
          </>
        }
        emptyContent={
          search ? (
            <div className="px-6 py-14 text-center text-sm text-text-secondary">
              No {tab === "pending" ? "scanned" : "placed"} lines match “{search}”.
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-primary)_10%,var(--color-surface-2))] text-primary">
                <ScanLine className="size-5" />
              </div>
              <h3 className="text-sm font-semibold text-text">
                {tab === "pending"
                  ? "Scan a Box UID, DC or PO to bring lines here"
                  : "No placed lines yet — place a received line in a rack from the Main Table"}
              </h3>
              <p className="mt-1 max-w-sm text-xs text-text-secondary">
                {tab === "pending"
                  ? "Only what was scanned at this station is listed. A Box UID brings its own line and opens receiving; a DC or PO brings every dispatched line on that document. They stay here — through receiving and verification — until their pieces are placed in a rack."
                  : "Receive a line on the Main Table, then use Place in rack. It moves here once every received piece is in a tray."}
              </p>
            </div>
          )
        }
        footer={
          <Pagination
            page={shownPage}
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
