"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, Lock, TriangleAlert } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { usePageSize } from "@/lib/usePageSize";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useSearchStore } from "@/stores/search";
import { useLineStatuses } from "@/features/status/hooks";
import type { StatusToneName } from "@/features/status/types";
import { patchOutwardByRef } from "@/features/masterdata/api";
import { useMdList, useMovementTypeMaster, useOutwardStatusMaster } from "@/features/masterdata/hooks";
import type { Box, SapOutward, Vendor } from "@/features/masterdata/types";
import { OutwardDocumentHover } from "./OutwardDocumentHover";
import { shortageSheetNote, shortageTrail } from "../shortageTrail";
import { OutwardDocumentModal } from "./receipts/OutwardDocumentModal";
import { vendorLabel, type OutwardDocKind } from "./receipts/types";
import { SapPageBanner } from "./SapPageBanner";
import { useSapRecords, useUpdateSapRecord } from "../hooks";
import type { ListRecordsParams, RecordUpdate, SapInwardRecord } from "../types";

/**
 * Outward status is derived, not chosen: entering a Box UID that exists as an
 * available box in Master Data marks the transaction as Dispatched, and the
 * status cell is then read-only.
 */
const DISPATCHED = "DISPATCHED";

const cell = (row: SapInwardRecord, key: string) =>
  (row as unknown as Record<string, unknown>)[key];

/** Stable 0–7 colour bucket for a categorical string — same value, same hue. */
function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 8;
}

/** 0–7 = categorical hue; named tones = state (warning = pending, orange = action needed). */
type ChipTone = number | "muted" | "success" | "warning" | "orange";

/** Status-service tone → grid chip tone (chips have no "info" / "danger" of their own). */
const CHIP_TONE: Record<StatusToneName, ChipTone> = {
  neutral: "muted",
  info: 0,
  success: "success",
  warning: "warning",
  orange: "orange",
  danger: 3,
  progress: 2,
};

type OutwardTab = "open" | "completed";

/**
 * SAP Outward is ONE table. It used to be split — Main Table for lines still to
 * dispatch, Complete Table for the dispatched ones — by asking the Status
 * service server-side which references held the outward stage. That split is
 * gone: every line shows here whatever its outward status.
 *
 * The helper stays so the query below reads the same, and so restoring the
 * split is a change in this one place.
 */
const outwardSplit = () => ({}) as const;

/**
 * Why a Box UID would not save. A 404 is not about the box at all: masterdata
 * has no outward line for the SAP reference and could not create one either, so
 * saying "not in master" would send the operator hunting the wrong problem.
 *
 * The cell is one column wide, so what it shows is a phrase, not a sentence;
 * masterdata's full wording stays as the title for anyone who wants it.
 */
export function boxSaveMessage(err: unknown): CellError {
  if (!(err instanceof ApiError)) return "Could not save — try again";
  if (err.status === 404) {
    return {
      text: "No outward line — run masterdata sync",
      title: "No outward line for this SAP reference — run the masterdata sync",
    };
  }
  const full = err.displayMessage || "Invalid Box UID";
  const duplicate = /already assigned to outward line (\S+)/.exec(full);
  if (duplicate) return { text: `Already on ${duplicate[1]}`, title: full };
  if (/not registered in the Boxes master/.test(full)) {
    return { text: "Not in the Boxes master", title: full };
  }
  if (/Box UID is locked/.test(full)) {
    return { text: "Dispatched — Box UID locked", title: full };
  }
  return full;
}

/** True once the line carries a Box UID and masterdata calls it dispatched. */
const isDispatched = (out: SapOutward | undefined) =>
  !!out?.box_uid && out.outward_status === DISPATCHED;

/**
 * `sap_outwards.origin` of a shortage back-order: the new outward line SAP
 * Inward raises for the balance a receiving entry did not account for
 * (`lot − accepted − rejected`), so it can be dispatched again.
 *
 * These lines exist in masterdata only. The grid below is the SAP service's
 * feed (`GET /sap/records`) joined to masterdata by `sap_reference_id`, and no
 * service may write another's tables — so masterdata could not put them in the
 * feed even if it wanted to. They are fetched separately and merged into the
 * Main Table here, client-side.
 */
const SHORTAGE = "SHORTAGE";

/**
 * A masterdata-only back-order line in the shape the SAP grid renders.
 * `vendorCode` is resolved by the caller: the line copies whatever its parent
 * outward row held, and that is null for a parent masterdata only ever created
 * lazily from a dispatch (`patch_sap_outward_by_ref` does not seed the vendor),
 * so the vendor is looked up from the parent's own feed record instead.
 */
const backorderRow = (o: SapOutward, vendorCode: string | null): SapInwardRecord => ({
  id: o.id,
  sap_reference_id: o.sap_reference_id,
  transaction_date: o.transaction_date,
  dc_no: o.dc_no,
  po_no: o.po_no,
  material_no: o.material_no,
  model_no: o.model_no,
  material_description: null,
  vendor_code: vendorCode,
  vendor_name: null,
  batch_no: o.batch_no,
  lot_no: o.lot_no,
  // the lot qty of a back-order IS the shortage it was raised for
  quantity: o.quantity == null ? null : String(o.quantity),
  movement_type: o.movement_type,
  remark: null,
  source_system: o.source_system,
  sync_id: null,
  created_at: o.created_at,
  updated_at: o.updated_at,
});

/**
 * What the red flag in the S.No cell says. The figures are derived, never
 * stored twice: the back-order's own lot qty is the shortage, and the parent
 * line carries the lot and the accepted qty it was worked out from.
 */
function shortageLabel(line: SapOutward, parent: SapOutward | undefined): string {
  const shortage = fmtNum(line.quantity);
  const from = line.parent_sap_reference_id ?? "the received line";
  const lot = parent?.quantity == null ? null : fmtNum(parent.quantity);
  const accepted = parent?.received_qty == null ? null : fmtNum(parent.received_qty);
  const detail = lot && accepted ? ` (lot ${lot}, accepted ${accepted})` : "";
  return `Shortage ${shortage} from ${from}${detail} · new line ${line.sap_reference_id}`;
}

/**
 * The SAP identifiers a new outward line is created from. The SAP feed lives in
 * another service, so a reference can reach this screen before masterdata has a
 * line for it; sending these alongside the Box UID lets the service create one.
 * They are ignored when the line already exists.
 */
const outwardSeedFrom = (row: SapInwardRecord) => ({
  transaction_date: row.transaction_date,
  sap_document_no: row.dc_no ?? null,
  dc_no: row.dc_no ?? null,
  po_no: row.po_no ?? null,
  material_no: row.material_no ?? null,
  model_no: row.model_no ?? null,
  // Carried across so the outward line names its own vendor: SAP Inward and
  // the receipts read masterdata, not the feed, and have no fallback to it.
  vendor_code: row.vendor_code ?? null,
  batch_no: row.batch_no ?? null,
  lot_no: row.lot_no ?? null,
  quantity: row.quantity ?? null,
  movement_type: row.movement_type ?? null,
});

/**
 * Instant tooltip — the native `title` waits ~1s and is lost when the 5s
 * refetch re-renders the row. Opens to the right so the table's overflow
 * container never clips it. Used by the grid's chips and by the shortage flag.
 */
function Tip({
  text,
  tipId,
  children,
}: {
  text: string;
  tipId: string;
  children: ReactNode;
}) {
  return (
    <span tabIndex={0} className="ds-focus-ring group relative inline-flex rounded-full outline-none">
      {children}
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-10 ml-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2 py-1 text-[11px] font-medium text-[var(--color-surface)] shadow-[var(--shadow-md)] group-hover:block group-focus-visible:block"
      >
        {text}
      </span>
    </span>
  );
}

/** Red warning marker beside the serial of a shortage back-order row. */
function ShortageFlag({ label }: { label: string }) {
  const tipId = useId();
  return (
    <Tip text={label} tipId={tipId}>
      <TriangleAlert
        role="img"
        aria-label={label}
        aria-describedby={tipId}
        className="size-3 shrink-0"
        style={{ color: "var(--color-danger)" }}
      />
    </Tip>
  );
}

/** Rounded categorical pill used across the SAP Outward grid. */
function Chip({
  children,
  tone,
  title,
  icon,
  outline,
}: {
  children: ReactNode;
  tone?: ChipTone;
  title?: string;
  icon?: ReactNode;
  outline?: boolean;
}) {
  const tipId = useId();
  const mod = typeof tone === "number" ? `ds-chip-${tone}` : tone ? `ds-chip-${tone}` : "";
  const chip = (
    <span
      className={`ds-chip ${mod}${outline ? " ds-chip-outline" : ""}${title ? " cursor-help" : ""}`.trim()}
      aria-describedby={title ? tipId : undefined}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
  if (!title) return chip;
  return (
    <Tip text={title} tipId={tipId}>
      {chip}
    </Tip>
  );
}

/**
 * Vendor name, read-only. One small font for every row so the column reads
 * evenly; long names wrap onto at most two lines. -my-0.5 lets the two lines
 * borrow cell padding so the row height does not change.
 */
function VendorText({ name, query }: { name: string; query: string }) {
  return (
    <span
      title={name}
      className="-my-0.5 line-clamp-2 block max-w-[6rem] whitespace-normal break-words text-[11px] leading-[1.15] text-text"
    >
      <Highlight text={name} query={query} />
    </span>
  );
}

/** "467.000" -> "467", "467.5" -> "467.5"; non-numeric text unchanged. */
function fmtNum(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(v);
}

/** Date and time as separate strings (user's locale) for the stacked Date / Timestamp cell. */
function fmtDateParts(v: string | null): { date: string; time: string } | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}


const escapeRegExp =(s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Marks every case-insensitive occurrence of the header-search query in `text`. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  // A capturing split puts the matches at the odd indices.
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-[var(--color-warning-bg)] px-0.5 text-inherit">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** Column shape lives here — exact headers/order per the SAP Upload reference. */
const COLUMN_DEFS: {
  key: keyof SapInwardRecord;
  header: string;
  width?: string;
  align?: "left" | "right";
  type?: "date" | "number" | "text";
  editable?: boolean;
}[] = [
  // A 1% width shrinks the column to its content instead of taking a share of the spare table width.
  { key: "transaction_date", header: "Date / Timestamp", type: "date", width: "1%" },
  { key: "dc_no", header: "DC no" },
  { key: "po_no", header: "PO no" },
  { key: "model_no", header: "Model" },
  { key: "vendor_name", header: "Vendor", width: "7rem" },
  { key: "batch_no", header: "Batch no" },
  { key: "movement_type", header: "SAP", align: "left" },
  { key: "quantity", header: "Lot Qty", align: "left", type: "number" },
];

/** Remark is rendered as the last column, after the outward transaction fields. */
const REMARK_DEF = { key: "remark" as const, header: "Remark", editable: true };

/**
 * Outward Status stays visible by default; the rest collapse behind "Show
 * more". Box UID is in this list but is filtered out of the Main Table (see
 * the column build below) — it is shown on the Complete Table only.
 */
const OUTWARD_PRIMARY_DEFS = [
  { key: "box_uid", header: "Box UID", type: "text" },
  { key: "outward_status", header: "Outward Status", type: "text" },
] as const;

const OUTWARD_EXTRA_DEFS = [
  { key: "tray_type", header: "Tray Type", type: "text" },
  { key: "no_of_trays", header: "No. of Trays", type: "number" },
  { key: "front_case_trays", header: "Front Case Trays", type: "number" },
  { key: "back_case_trays", header: "Back Case Trays", type: "number" },
] as const;

function SapEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex items-end gap-1" aria-hidden>
        <span className="h-2.5 w-0.5 rounded-full bg-primary/50" />
        <span className="h-4 w-0.5 rounded-full bg-primary/70" />
        <span className="h-2.5 w-0.5 rounded-full bg-primary/50" />
      </div>
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface-2))] text-text-muted">
        <Inbox className="size-6" strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-semibold text-text">No SAP records</h3>
      <p className="mt-1 max-w-sm text-xs text-text-secondary">
        Run a SAP sync to pull inward document lines.
      </p>
    </div>
  );
}

export function SapUploadView() {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  // One table, so there is nothing to switch: `tab` is pinned. It still gates
  // the Box UID column and the back-order split below, which stay in place.
  const tab: OutwardTab = "open";
  // DC / PO sheet opened from a cell's hover card.
  const [docView, setDocView] = useState<{ kind: OutwardDocKind; id: string } | null>(null);
  const closeDoc = useCallback(() => setDocView(null), []);
  const PAGE_SIZE = usePageSize();
  const updateRecord = useUpdateSapRecord();
  const toast = useToast();
  const qc = useQueryClient();

  // Live ("elastic") search — typed in the header bar, filters server-side.
  const query = useSearchStore((s) => s.query);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    setPage(1);
  }, [search, tab]);

  // Box UIDs live in masterdata, not in the SAP feed. Resolve the query against
  // the outward lines there (case-insensitive) and let the SAP service OR the
  // matching reference ids into its own text search. With no query the params
  // equal the `outwards` list below, so React Query shares one request.
  const outwardMatches = useMdList<SapOutward>(
    "sap-outwards",
    search ? { page_size: 200, search } : { page_size: 200 },
  );
  const matchedRefs = useMemo(
    () =>
      search && !outwardMatches.isPlaceholderData
        ? (outwardMatches.data?.items ?? []).map((o) => o.sap_reference_id).join(",")
        : "",
    [search, outwardMatches.data, outwardMatches.isPlaceholderData],
  );

  const params = useMemo<ListRecordsParams>(
    () => ({
      page,
      page_size: PAGE_SIZE,
      ...(search ? { search } : {}),
      ...(matchedRefs ? { refs: matchedRefs } : {}),
      ...outwardSplit(),
    }),
    [page, PAGE_SIZE, search, matchedRefs, tab],
  );
  const records = useSapRecords(params);
  // The box / tray / status of each transaction lives in the Masterdata service's
  // sap_outwards table, keyed by sap_reference_id. Fetch exactly the lines
  // behind the SAP records on this page — a blind first-200 window would
  // silently drop the outward line of every row past it.
  const pageRefs = useMemo(
    () => (records.data?.items ?? []).map((r) => r.sap_reference_id).join(","),
    [records.data],
  );
  const outwards = useMdList<SapOutward>(
    "sap-outwards",
    pageRefs ? { refs: pageRefs, page_size: 200 } : { page_size: 200 },
  );

  // References dispatched in this session — the row leaves the Main Table at
  // once, before the Status service has been re-read. Declared here because
  // the back-order list below is filtered by it too.
  const [justDispatched, setJustDispatched] = useState<ReadonlySet<string>>(new Set());

  // Shortage back-orders (masterdata only — see SHORTAGE above). Searching is
  // server-side there too, over the same DC / PO / model / batch columns.
  const backorders = useMdList<SapOutward>("sap-outwards", {
    page: 1,
    page_size: 200,
    origin: SHORTAGE,
    status: "active",
    ...(search ? { search } : {}),
  });
  const backorderLines = useMemo(
    () => backorders.data?.items ?? [],
    [backorders.data],
  );
  /**
   * A back-order sits on exactly the tab a feed line in the same state would:
   * the Main Table until a Box UID dispatches it, the Complete Table after.
   * `justDispatched` covers the moment between the scan and the Status service
   * being re-read.
   */
  const [pendingBackorders, dispatchedBackorders] = useMemo(() => {
    const open: SapOutward[] = [];
    const done: SapOutward[] = [];
    for (const o of backorderLines) {
      (isDispatched(o) || justDispatched.has(o.sap_reference_id) ? done : open).push(o);
    }
    return [open, done] as const;
  }, [backorderLines, justDispatched]);
  // One table, so both kinds of back-order belong in it.
  const tabBackorders = useMemo(
    () => [...pendingBackorders, ...dispatchedBackorders],
    [pendingBackorders, dispatchedBackorders],
  );
  // The lines the shortages were taken from — for the flag's tooltip, which
  // quotes the lot and the accepted qty the figure was derived from.
  const parentRefs = useMemo(
    () =>
      [
        ...new Set(
          backorderLines.map((o) => o.parent_sap_reference_id).filter((r): r is string => !!r),
        ),
      ].join(","),
    [backorderLines],
  );
  const backorderParents = useMdList<SapOutward>(
    "sap-outwards",
    parentRefs ? { refs: parentRefs, page_size: 200 } : { page_size: 200 },
  );

  const outwardByRef = useMemo(() => {
    const m = new Map<string, SapOutward>();
    for (const o of outwards.data?.items ?? []) m.set(o.sap_reference_id, o);
    // The back-orders are not in the SAP feed, so nothing fetched them above —
    // but every outward cell (Box UID, Outward Status, …) reads this map.
    for (const o of backorderLines) m.set(o.sap_reference_id, o);
    return m;
  }, [outwards.data, backorderLines]);
  /** Back-order rows by the row id the grid renders them under. */
  const backorderByRowId = useMemo(() => {
    const m = new Map<string, SapOutward>();
    for (const o of backorderLines) m.set(o.id, o);
    return m;
  }, [backorderLines]);
  const parentByRef = useMemo(() => {
    const m = new Map<string, SapOutward>();
    for (const o of backorderParents.data?.items ?? []) m.set(o.sap_reference_id, o);
    return m;
  }, [backorderParents.data]);
  // The parents' feed rows, for the Vendor column: the SAP feed always carries
  // a vendor code, while the masterdata outward row may not (see backorderRow).
  const parentFeed = useSapRecords(
    { refs: parentRefs, page_size: 200 },
    { enabled: parentRefs.length > 0 },
  );
  const parentFeedVendorByRef = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of parentFeed.data?.items ?? []) {
      if (r.vendor_code) m.set(r.sap_reference_id, r.vendor_code);
    }
    return m;
  }, [parentFeed.data]);
  /**
   * Vendor for a back-order: its own code, else the parent outward row's, else
   * the parent's feed record — the first of the three that actually has one.
   */
  const backorderVendorCode = useCallback(
    (o: SapOutward): string | null => {
      if (o.vendor_code) return o.vendor_code;
      const ref = o.parent_sap_reference_id;
      if (!ref) return null;
      return parentByRef.get(ref)?.vendor_code ?? parentFeedVendorByRef.get(ref) ?? null;
    },
    [parentByRef, parentFeedVendorByRef],
  );

  // Vendor column is shown from the Vendor master, not the raw SAP feed — a code
  // that isn't a registered vendor renders as "— (not in master)".
  // Box UID master — a transaction can only be dispatched against a Box UID that
  // exists here and is still "active" (i.e. an available box).
  // `page` is sent so the service returns a real total: the client-side Box UID
  // pre-check may only reject a value when this page holds every box there is.
  const boxesList = useMdList<Box>("boxes", { page: 1, page_size: 200 });
  const availableBoxUids = useMemo(() => {
    const s = new Set<string>();
    for (const b of boxesList.data?.items ?? []) {
      if (b.status === "active") s.add(b.box_uid);
    }
    return s;
  }, [boxesList.data]);
  // The pre-check may only reject a UID when we are holding the whole master —
  // with more boxes than one page, an unknown value goes to the service.
  const boxesComplete =
    !!boxesList.data && boxesList.data.items.length >= (boxesList.data.total ?? 0);

  // SAP movement-type lookup (masterdata) — code → description, shown on hover
  // of the "SAP" cell. Edited from /masterdata-admin, not hardcoded.
  const movementTypeMaster = useMovementTypeMaster();
  const movementInfo = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of movementTypeMaster.data ?? []) m.set(d.code, d.description);
    return m;
  }, [movementTypeMaster.data]);

  // Outward-status lookup (masterdata) — code → label / dispatched flag.
  const statusMaster = useOutwardStatusMaster();
  const statusDef = useMemo(() => {
    const m = new Map<string, { label: string; dispatched: boolean }>();
    for (const d of statusMaster.data ?? [])
      m.set(d.code, { label: d.label, dispatched: d.is_dispatched });
    return m;
  }, [statusMaster.data]);

  const vendorsList = useMdList<Vendor>("vendors", { page_size: 200 });
  const vendorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendorsList.data?.items ?? []) m.set(v.vendor_code, v.vendor_name);
    return m;
  }, [vendorsList.data]);

  /** Vendor as printed on the DC / PO: Vendor-master name + code of the line. */
  const documentVendor = (row: SapInwardRecord) => {
    const code = outwardByRef.get(row.sap_reference_id)?.vendor_code ?? row.vendor_code;
    return vendorLabel(code ? vendorName.get(code) : null, code);
  };

  // With one table there is nowhere for a row to move to, so nothing is held
  // back: a line just dispatched in this session stays exactly where it is.
  const feedRows = useMemo(() => records.data?.items ?? [], [records.data]);
  const hidden = (records.data?.items?.length ?? 0) - feedRows.length;
  // Back-orders live in masterdata, not the feed, so they are fetched once and
  // carried on the first page. The totals below count them once, on whichever
  // tab they belong to.
  const backorderCount = tabBackorders.length;
  const pinned = useMemo(
    () => (page === 1 ? tabBackorders.map((o) => backorderRow(o, backorderVendorCode(o))) : []),
    [page, tabBackorders, backorderVendorCode],
  );
  // Back-orders take their place among the feed rows by date rather than
  // sitting on top of them, sorted on the same key the SAP service pages by
  // (`transaction_date DESC, sap_reference_id DESC` — repository.py:83-85), so
  // page 1 reads continuously into page 2.
  //
  // Only correct *within* page 1: the feed is paged server-side while the
  // back-orders are all fetched here, so one older than the last feed row of
  // page 1 still shows on page 1 instead of on its true page. Acceptable for
  // the MVP; the clean fix is to merge them into the feed query server-side.
  const rows = useMemo(() => {
    const time = (r: SapInwardRecord) => {
      const t = Date.parse(r.transaction_date);
      return Number.isNaN(t) ? 0 : t;
    };
    return [...pinned, ...feedRows].sort((a, b) => {
      const byDate = time(b) - time(a);
      if (byDate !== 0) return byDate;
      // Plain code-unit compare, like the server's, not localeCompare.
      const ar = a.sap_reference_id;
      const br = b.sap_reference_id;
      return ar === br ? 0 : ar < br ? 1 : -1;
    });
  }, [pinned, feedRows]);
  const docRow = docView ? (rows.find((r) => r.id === docView.id) ?? null) : null;
  /** The back-order behind the open document sheet, if it is one. */
  const docBackorder = docView ? (backorderByRowId.get(docView.id) ?? null) : null;
  const total = Math.max(0, (records.data?.total ?? 0) - hidden) + backorderCount;
  // Each line's status per stage comes from the Status service.
  const lineStatus = useLineStatuses(rows.map((r) => r.sap_reference_id));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function patch(id: string, patchBody: RecordUpdate) {
    try {
      await updateRecord.mutateAsync({ id, patch: patchBody });
    } catch {
      toast("error", "Update failed");
    }
  }

  async function patchOutward(
    ref: string,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      await patchOutwardByRef(ref, body);
      await qc.invalidateQueries({ queryKey: ["masterdata", "sap-outwards"] });
      return true;
    } catch (err) {
      toast(
        "error",
        err instanceof ApiError ? err.displayMessage : "Save failed — value not in master data",
      );
      return false;
    }
  }

  /**
   * Inline "this Box UID is no good" message per line, shown in the cell itself
   * — a toast alone is missed by an operator whose eyes are on the scanner.
   */
  const [boxError, setBoxError] = useState<Record<string, CellError>>({});
  const clearBoxError = useCallback((ref: string) => {
    setBoxError((prev) => {
      if (!(ref in prev)) return prev;
      const next = { ...prev };
      delete next[ref];
      return next;
    });
  }, []);

  /**
   * Inline "this lot qty is no good" message per line. Same reasoning as the
   * Box UID message: the operator is looking at the cell, not at a toast.
   */
  const [qtyError, setQtyError] = useState<Record<string, string>>({});
  const clearQtyError = useCallback((id: string) => {
    setQtyError((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  /**
   * Save an edited Lot Qty. The lot is split down the middle into front and
   * back cases downstream (Receiving), so only a whole, even qty is accepted —
   * an odd one would yield half a case. The service enforces the same rule.
   */
  async function saveQuantity(
    row: SapInwardRecord,
    value: string | number | null,
  ): Promise<boolean> {
    const id = row.id;
    clearQtyError(id);
    if (value == null || value === "") {
      setQtyError((prev) => ({ ...prev, [id]: "Enter a lot qty" }));
      return false;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      setQtyError((prev) => ({ ...prev, [id]: "Lot qty must be a whole number above 0" }));
      return false;
    }
    if (n % 2 !== 0) {
      setQtyError((prev) => ({
        ...prev,
        [id]: "Lot qty must be even — it splits equally into front and back cases",
      }));
      return false;
    }
    try {
      await updateRecord.mutateAsync({ id, patch: { quantity: n } });
    } catch (err) {
      setQtyError((prev) => ({
        ...prev,
        [id]: err instanceof ApiError ? err.displayMessage : "Update failed",
      }));
      return false;
    }
    return true;
  }

  /**
   * Save a scanned / typed Box UID. Validation belongs to the service
   * (`_validate_master_refs`, active boxes only) — the Boxes master we hold is
   * only a fast path, and only trusted when we have the whole of it.
   */
  async function saveBoxUid(row: SapInwardRecord, value: string | number | null) {
    const ref = row.sap_reference_id;
    const uid = value == null ? "" : String(value).trim().toUpperCase();
    clearBoxError(ref);
    if (!uid) {
      setBoxError((prev) => ({ ...prev, [ref]: "Scan or type a Box UID" }));
      return false;
    }
    if (boxesComplete && !availableBoxUids.has(uid)) {
      setBoxError((prev) => ({ ...prev, [ref]: "Invalid Box UID" }));
      return false;
    }
    try {
      await patchOutwardByRef(ref, { box_uid: uid, ...outwardSeedFrom(row) });
    } catch (err) {
      setBoxError((prev) => ({ ...prev, [ref]: boxSaveMessage(err) }));
      return false;
    }
    // Dispatched: leave the Main Table now, then refresh every list the move
    // touches (the SAP feed's split, the outward lines, the Status service).
    setJustDispatched((prev) => new Set(prev).add(ref));
    toast("success", `Dispatched · ${uid}`);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["sap", "records"] }),
      qc.invalidateQueries({ queryKey: ["masterdata", "sap-outwards"] }),
      qc.invalidateQueries({ queryKey: ["status"] }),
    ]);
    return true;
  }

  // Page 1 carries the back-orders among a full page of feed rows, so every
  // later page starts that many serials further along. Where they sit within
  // the page does not change the count, only the order.
  const serialByFirstPage = (page - 1) * PAGE_SIZE + (page > 1 ? backorderCount : 0);
  const serialOf = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.id, serialByFirstPage + i + 1));
    return m;
  }, [rows, serialByFirstPage]);

  const columns: Column<SapInwardRecord>[] = useMemo(
    () => [
      {
        key: "__serial",
        header: "S.No",
        align: "right" as const,
        sortable: false,
        render: (row: SapInwardRecord) => {
          const serial = serialOf.get(row.id) ?? "—";
          const line = backorderByRowId.get(row.id);
          if (!line) return serial;
          // A shortage back-order is flagged where the eye lands first.
          return (
            <span className="inline-flex items-center justify-end gap-1">
              {serial}
              <ShortageFlag
                label={shortageLabel(
                  line,
                  line.parent_sap_reference_id
                    ? parentByRef.get(line.parent_sap_reference_id)
                    : undefined,
                )}
              />
            </span>
          );
        },
      },
      ...COLUMN_DEFS.map((c) => ({
        key: c.key,
        header: c.header,
        ...(c.width ? { width: c.width } : {}),
        sortable: true,
        align: c.align ?? (c.type === "number" ? "right" : "left"),
        accessor: (row: SapInwardRecord) => cell(row, c.key) as string | number | null,
        render: (row: SapInwardRecord) => {
          if (c.type === "date") {
            const p = fmtDateParts(row.transaction_date);
            if (!p) return <span className="text-text-muted">—</span>;
            // -my-0.5 lets the two lines borrow 2px of the cell padding so the
            // row keeps the height set by the single-line chips beside it.
            return (
              <span className="-my-0.5 block text-[11px] leading-[1.15]">
                <span className="block">{p.date}</span>
                <span className="block text-text-muted">{p.time}</span>
              </span>
            );
          }
          if (c.editable) {
            // A back-order has no record in the SAP feed, so there is nothing
            // to write a remark to.
            if (backorderByRowId.has(row.id)) return <span className="text-text-muted">—</span>;
            return <RemarkCell row={row} onSave={(v) => patch(row.id, { remark: v })} />;
          }
          if (c.key === "vendor_name") {
            // Read-only: the vendor comes from the outward line (else the SAP
            // feed), shown by its Vendor-master name.
            const code = outwardByRef.get(row.sap_reference_id)?.vendor_code ?? row.vendor_code;
            const name = code ? (vendorName.get(code) ?? code) : null;
            return name ? (
              <VendorText name={name} query={search} />
            ) : (
              <span className="text-text-muted">—</span>
            );
          }
          if (c.key === "quantity") {
            const out = outwardByRef.get(row.sap_reference_id);
            const qty = row.quantity == null || row.quantity === "" ? null : Number(row.quantity);
            // Once the line is dispatched the lot has left — the qty is frozen,
            // exactly like its Box UID.
            if (isDispatched(out)) {
              return (
                <Chip
                  tone="success"
                  title="Locked — this line is dispatched"
                  icon={<Lock className="size-3" />}
                >
                  {fmtNum(qty)}
                </Chip>
              );
            }
            // A back-order's lot qty IS the shortage it was raised for — the
            // service worked it out, so it is shown, not edited.
            if (backorderByRowId.has(row.id)) {
              return <Chip tone="warning">{fmtNum(qty)}</Chip>;
            }
            return (
              <OutwardCell
                field="lot_qty"
                kind="number"
                value={qty}
                display={{ kind: "num", tone: 4 }}
                error={qtyError[row.id] ?? null}
                onDraftChange={() => clearQtyError(row.id)}
                onSave={(v) => saveQuantity(row, v)}
              />
            );
          }

          const v = cell(row, c.key);
          if (v == null || v === "") return <span className="text-text-muted">—</span>;

          if (c.key === "dc_no" || c.key === "po_no") {
            const kind: OutwardDocKind = c.key === "dc_no" ? "dc" : "po";
            // A back-order's own qty IS the shortage, so on its own it says
            // nothing — the card gets the whole trail it was worked out from.
            const backorder = backorderByRowId.get(row.id);
            return (
              <OutwardDocumentHover
                kind={kind}
                line={row}
                boxUid={outwardByRef.get(row.sap_reference_id)?.box_uid ?? null}
                vendorLabel={documentVendor(row)}
                shortage={
                  backorder
                    ? shortageTrail(
                        backorder,
                        backorder.parent_sap_reference_id
                          ? parentByRef.get(backorder.parent_sap_reference_id)
                          : undefined,
                      )
                    : undefined
                }
                onView={() => setDocView({ kind, id: row.id })}
                trigger={
                  <span className="ds-cell-id">
                    <Highlight text={String(v)} query={search} />
                  </span>
                }
              />
            );
          }
          if (c.key === "model_no") {
            return (
              <Chip tone={hueOf(String(v))}>
                <Highlight text={String(v)} query={search} />
              </Chip>
            );
          }
          if (c.key === "batch_no") return <Highlight text={String(v)} query={search} />;
          if (c.key === "movement_type") {
            const meaning = movementInfo.get(String(v)) ?? "SAP movement type";
            return (
              <Chip tone={2} title={`${String(v)} — ${meaning}`}>
                {String(v)}
              </Chip>
            );
          }
          if (c.type === "number") return fmtNum(v);
          return String(v);
        },
      })),
      ...[
        // Box UID is shown on the Complete Table only. Every line there is
        // already dispatched, so the cell renders the frozen chip; the Main
        // Table, which holds the lines before dispatch, no longer carries it.
        ...OUTWARD_PRIMARY_DEFS.filter((c) => c.key !== "box_uid" || tab === "completed"),
        ...(expanded ? OUTWARD_EXTRA_DEFS : []),
      ].map((c) => ({
        key: `out_${c.key}`,
        header: c.header,
        sortable: false,
        align: (c.type === "number" ? "right" : "left") as "left" | "right",
        accessor: (row: SapInwardRecord) =>
          (outwardByRef.get(row.sap_reference_id)?.[c.key] ?? null) as string | number | null,
        render: (row: SapInwardRecord) => {
          const out = outwardByRef.get(row.sap_reference_id);

          // Box UID: reached only from the Complete Table now, where every
          // line is dispatched, so the frozen chip is what renders. The
          // editable branch below is kept intact so putting the column back on
          // the Main Table is a one-line change.
          if (c.key === "box_uid") {
            if (isDispatched(out)) {
              return (
                <Chip
                  tone="success"
                  title="Locked — this line is dispatched"
                  icon={<Lock className="size-3" />}
                >
                  <Highlight text={out!.box_uid as string} query={search} />
                </Chip>
              );
            }
            return (
              <OutwardCell
                field="box_uid"
                kind="text"
                value={out?.box_uid ?? null}
                display={{ kind: "chip", tone: "warning" }}
                placeholderTone="orange"
                highlight={search}
                selectOnFocus
                uppercase
                error={boxError[row.sap_reference_id] ?? null}
                onDraftChange={() => clearBoxError(row.sap_reference_id)}
                onSave={(v) => saveBoxUid(row, v)}
              />
            );
          }

          // Outward Status is read-only — three sources, in order of authority.
          // It is handled before the "no outward line" guard below, because a
          // line masterdata has never seen still has a status to show.
          if (c.key === "outward_status") {
            //  1. the Status service, the source of truth (Received, and any
            //     later stage it reports).
            const st = lineStatus.statusOf(row.sap_reference_id, "outward");
            if (st) return <Chip tone={CHIP_TONE[st.tone]}>{st.label}</Chip>;
            //  2. the line's own stored status, when masterdata has a row for
            //     it — this is what puts Pending on a shortage back-order.
            //  3. nothing stored: the line reads Dispatched, the state a SAP
            //     line arrives in. Display only — see the note in the header
            //     comment: it does not mean the Status service agrees.
            const code = out?.outward_status ?? DISPATCHED;
            const def = statusDef.get(code);
            const dispatched = def?.dispatched ?? code === DISPATCHED;
            const label = def?.label ?? (dispatched ? "Dispatched" : "Yet to Dispatch");
            return <Chip tone={dispatched ? "success" : "warning"}>{label}</Chip>;
          }

          if (!out) return <span className="text-text-muted">—</span>;

          const NUM_HUE: Record<string, number> = {
            no_of_trays: 6,
            front_case_trays: 1,
            back_case_trays: 3,
          };
          const display: { kind: "chip" | "num"; tone: ChipTone } | undefined =
            c.key === "tray_type"
              ? { kind: "chip", tone: 0 }
              : c.type === "number"
                ? { kind: "num", tone: NUM_HUE[c.key] ?? 0 }
                : undefined;

          return (
            <OutwardCell
              field={c.key}
              kind={c.type}
              value={out[c.key] as string | number | null}
              {...(display ? { display } : {})}
              onSave={(v) => patchOutward(out.sap_reference_id, { [c.key]: v })}
            />
          );
        },
      })),
      ...(expanded
        ? [
            {
              key: REMARK_DEF.key,
              header: REMARK_DEF.header,
              sortable: true,
              align: "left" as const,
              accessor: (row: SapInwardRecord) => row.remark ?? null,
              render: (row: SapInwardRecord) => (
                <RemarkCell row={row} onSave={(v) => patch(row.id, { remark: v })} />
              ),
            },
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      expanded,
      tab,
      updateRecord.isPending,
      serialOf,
      outwardByRef,
      vendorName,
      boxError,
      qtyError,
      boxesComplete,
      availableBoxUids,
      statusDef,
      movementInfo,
      search,
      lineStatus.statusOf,
      backorderByRowId,
      parentByRef,
    ],
  );

  return (
    <>
      <SapPageBanner expanded={expanded} onToggle={() => setExpanded((e) => !e)} />

      <DataTable<SapInwardRecord>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={records.isLoading}
        error={records.isError}
        onRetry={() => void records.refetch()}
        headerVariant="solid"
        columnDividers
        stickyHeader={false}
        compact
        emptyContent={
          search ? (
            <div className="px-6 py-14 text-center text-sm text-text-secondary">
              No records match “{search}”.
            </div>
          ) : (
            <SapEmptyState />
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
      <OutwardDocumentModal
        view={
          docView && docRow
            ? {
                kind: docView.kind,
                line: docRow,
                vendorLabel: documentVendor(docRow),
                // The sheet's printed Qty is this line's own — correct for a
                // back-order document. The note beside it, which is not part
                // of the document, says which balance it is.
                ...(docBackorder
                  ? {
                      note: shortageSheetNote(
                        shortageTrail(
                          docBackorder,
                          docBackorder.parent_sap_reference_id
                            ? parentByRef.get(docBackorder.parent_sap_reference_id)
                            : undefined,
                        ),
                      ),
                    }
                  : {}),
              }
            : null
        }
        onClose={closeDoc}
      />
    </>
  );
}

/**
 * One editable outward cell. Exported for its own test: the Box UID cell is the
 * scanner's target, so its rejected state has to be provably visible.
 */
/**
 * A rejection shown inside a table cell. A plain string is both the text and
 * the whole story; the object form shows a short phrase and keeps the long
 * wording — masterdata writes for an API consumer, not for an 8rem column — as
 * the title.
 */
export type CellError = string | { text: string; title: string };

export function OutwardCell({
  field,
  kind,
  value,
  optionLabel,
  display,
  placeholderTone,
  highlight,
  selectOnFocus,
  uppercase,
  error,
  onDraftChange,
  onSave,
}: {
  field: string;
  kind: "text" | "number";
  value: string | number | null;
  optionLabel?: (o: string) => string;
  display?: { kind: "chip" | "num"; tone: ChipTone };
  /** render the empty "Set …" placeholder as an outline chip in this tone */
  placeholderTone?: ChipTone;
  /** header-search query to mark inside a plain (non-chip) value */
  highlight?: string;
  /** select all on focus so a barcode scan overwrites the current value */
  selectOnFocus?: boolean;
  /** force the value to upper-case as it is typed (Box UID) */
  uppercase?: boolean;
  /** rejection message shown inside the cell; the owner clears it */
  error?: CellError | null;
  /** fired on every keystroke / scan so the owner can drop a stale error */
  onDraftChange?: () => void;
  onSave: (v: string | number | null) => void | boolean | Promise<void | boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const committing = useRef(false);
  /** the last value the server (or the pre-check) turned down — never re-sent */
  const rejected = useRef<string | null>(null);
  const label = (o: string) => (optionLabel ? optionLabel(o) : o);
  const shown = value == null || value === "" ? null : label(String(value));

  async function commit() {
    if (committing.current) return;
    const norm = draft.trim();
    const current = value == null ? "" : String(value);
    if (norm === current) {
      onDraftChange?.(); // nothing to save — drop any message left from a rejection
      setEditing(false);
      return;
    }
    // A rejected value stays in the box so the next scan can overwrite it, and
    // the cell keeps the focus — so every following blur or Enter would re-send
    // the very same value. Ask once; only a changed value asks again.
    if (norm === rejected.current) return;
    committing.current = true;
    const res = await onSave(norm === "" ? null : kind === "number" ? Number(norm) : norm);
    committing.current = false;
    if (res === false) {
      // Rejected (duplicate / locked / not in master). Stay in edit mode and
      // reselect the whole value so the next scan replaces it in one shot.
      rejected.current = norm;
      setEditing(true);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    } else {
      rejected.current = null;
      setEditing(false);
    }
  }

  if (!editing) {
    const placeholder = `Set ${field.replace(/_/g, " ")}…`;
    let content: ReactNode = placeholderTone ? (
      <Chip tone={placeholderTone} outline>
        {placeholder}
      </Chip>
    ) : (
      <span className="text-text-muted">{placeholder}</span>
    );
    if (shown != null) {
      if (display?.kind === "chip")
        content = (
          <Chip tone={display.tone}>
            {highlight !== undefined ? <Highlight text={shown} query={highlight} /> : shown}
          </Chip>
        );
      else if (display?.kind === "num")
        content = <span className={`ds-num ds-chip-${display.tone}`}>{shown}</span>;
      else content = highlight !== undefined ? <Highlight text={shown} query={highlight} /> : shown;
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(value == null ? "" : String(value));
          setEditing(true);
        }}
        className="ds-focus-ring rounded px-1 text-left text-text-secondary hover:bg-surface-2 hover:text-text"
      >
        {content}
      </button>
    );
  }

  // One stable wrapper whether or not there is a message: the input must not be
  // remounted when the error appears, or it loses the focus and the selection
  // the next scan is meant to overwrite.
  return (
    <span className="-my-0.5 inline-flex flex-col gap-0.5">
      <input
      ref={inputRef}
      autoFocus
      type={kind === "number" ? "number" : "text"}
      value={draft}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      onClick={(e) => e.stopPropagation()}
      onFocus={selectOnFocus ? (e) => e.currentTarget.select() : undefined}
      onChange={(e) => {
        onDraftChange?.();
        const next = uppercase ? e.target.value.toUpperCase() : e.target.value;
        // Edited away from the rejected value — it may be tried again later.
        if (next !== rejected.current) rejected.current = null;
        setDraft(next);
      }}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        }
        if (e.key === "Escape") {
          onDraftChange?.();
          setDraft(value == null ? "" : String(value));
          setEditing(false);
        }
      }}
      className={cn(
        "h-8 w-32 rounded-[var(--radius-sm)] border bg-surface px-2 text-xs text-text outline-none",
        error
          ? "border-[var(--color-danger)] focus:border-[var(--color-danger)]"
          : "border-border-strong focus:border-primary",
        uppercase && "uppercase",
      )}
      />
      {error ? (
        // The value was rejected: the cell keeps it, selected and ready for the
        // next scan, and says why right where the operator is looking. The
        // message wraps inside the input's own width — the table cell around it
        // sets `whitespace-nowrap`, and one long line there would stretch the
        // column and push the whole grid past the viewport.
        <span
          id={errorId}
          role="alert"
          title={typeof error === "string" ? undefined : error.title}
          className="w-32 whitespace-normal break-words text-[10px] leading-tight text-[var(--color-danger)]"
        >
          {typeof error === "string" ? error : error.text}
        </span>
      ) : null}
    </span>
  );
}

function RemarkCell({
  row,
  onSave,
}: {
  row: SapInwardRecord;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.remark ?? "");

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(row.remark ?? "");
          setEditing(true);
        }}
        className="ds-focus-ring max-w-[16rem] truncate rounded px-1 text-left text-text-secondary hover:bg-surface-2 hover:text-text"
      >
        {row.remark || <span className="text-text-muted">Add remark…</span>}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== (row.remark ?? "")) onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
      className="h-8 w-56 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-xs text-text outline-none focus:border-primary"
    />
  );
}
