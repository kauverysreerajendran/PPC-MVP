"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, Lock, MapPin } from "lucide-react";
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
import { OutwardDocumentModal } from "./receipts/OutwardDocumentModal";
import { vendorLabel, type OutwardDocKind } from "./receipts/types";
import { SapPageBanner } from "./SapPageBanner";
import { useSapRecords, useUpdateSapRecord } from "../hooks";
import type { ListRecordsParams, SapInwardRecord } from "../types";

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
 * Open = dispatched lines not yet received; Completed = received. The split is
 * the outward stage held by the Status service, applied server-side.
 */
const outwardSplit = (tab: OutwardTab) =>
  ({
    status_stage: "outward",
    status_code: "RECEIVED",
    status_match: tab === "completed" ? "include" : "exclude",
  }) as const;

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
  // Instant tooltip instead of the native `title` (which waits ~1s and is lost
  // when the 5s refetch re-renders the row). Opens to the right so the table's
  // overflow container never clips it.
  return (
    <span tabIndex={0} className="ds-focus-ring group relative inline-flex rounded-full outline-none">
      {chip}
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-10 ml-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2 py-1 text-[11px] font-medium text-[var(--color-surface)] shadow-[var(--shadow-md)] group-hover:block group-focus-visible:block"
      >
        {title}
      </span>
    </span>
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

/** Box UID / Outward Status stay visible by default; the rest collapse behind "Show more". */
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
  const [tab, setTab] = useState<OutwardTab>("open");
  // DC / PO sheet opened from a cell's hover card.
  const [docView, setDocView] = useState<{ kind: OutwardDocKind; id: string } | null>(null);
  const closeDoc = useCallback(() => setDocView(null), []);
  const PAGE_SIZE = usePageSize();
  const updateRecord = useUpdateSapRecord();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();

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
      ...outwardSplit(tab),
    }),
    [page, PAGE_SIZE, search, matchedRefs, tab],
  );
  // Just the total of the other tab, for its badge.
  const otherTab: OutwardTab = tab === "open" ? "completed" : "open";
  const otherCount = useSapRecords({
    page: 1,
    page_size: 1,
    ...(search ? { search } : {}),
    ...(matchedRefs ? { refs: matchedRefs } : {}),
    ...outwardSplit(otherTab),
  });

  const records = useSapRecords(params);
  // The box / tray / status of each transaction lives in the Masterdata service's
  // sap_outwards table, keyed by sap_reference_id.
  const outwards = useMdList<SapOutward>("sap-outwards", { page_size: 200 });
  const outwardByRef = useMemo(() => {
    const m = new Map<string, SapOutward>();
    for (const o of outwards.data?.items ?? []) m.set(o.sap_reference_id, o);
    return m;
  }, [outwards.data]);

  // Vendor column is shown from the Vendor master, not the raw SAP feed — a code
  // that isn't a registered vendor renders as "— (not in master)".
  // Box UID master — a transaction can only be dispatched against a Box UID that
  // exists here and is still "active" (i.e. an available box).
  const boxesList = useMdList<Box>("boxes", { page_size: 200 });
  const availableBoxUids = useMemo(() => {
    const s = new Set<string>();
    for (const b of boxesList.data?.items ?? []) {
      if (b.status === "active") s.add(b.box_uid);
    }
    return s;
  }, [boxesList.data]);

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

  const rows = useMemo(() => records.data?.items ?? [], [records.data]);
  const docRow = docView ? (rows.find((r) => r.id === docView.id) ?? null) : null;
  const total = records.data?.total ?? 0;
  const tabTotals: Record<OutwardTab, number | undefined> = {
    [tab]: records.data?.total,
    [otherTab]: otherCount.data?.total,
  } as Record<OutwardTab, number | undefined>;
  // Each line's status per stage comes from the Status service.
  const lineStatus = useLineStatuses(rows.map((r) => r.sap_reference_id));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function patch(id: string, patchBody: { remark?: string }) {
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

  const serialByFirstPage = (page - 1) * PAGE_SIZE;
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
        render: (row: SapInwardRecord) => serialOf.get(row.id) ?? "—",
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
          const v = cell(row, c.key);
          if (v == null || v === "") return <span className="text-text-muted">—</span>;

          if (c.key === "dc_no" || c.key === "po_no") {
            const kind: OutwardDocKind = c.key === "dc_no" ? "dc" : "po";
            return (
              <OutwardDocumentHover
                kind={kind}
                line={row}
                boxUid={outwardByRef.get(row.sap_reference_id)?.box_uid ?? null}
                vendorLabel={documentVendor(row)}
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
      ...[...OUTWARD_PRIMARY_DEFS, ...(expanded ? OUTWARD_EXTRA_DEFS : [])].map((c) => ({
        key: `out_${c.key}`,
        header: c.header,
        sortable: false,
        align: (c.type === "number" ? "right" : "left") as "left" | "right",
        accessor: (row: SapInwardRecord) =>
          (outwardByRef.get(row.sap_reference_id)?.[c.key] ?? null) as string | number | null,
        render: (row: SapInwardRecord) => {
          const out = outwardByRef.get(row.sap_reference_id);
          if (!out) return <span className="text-text-muted">—</span>;

          // Status is derived from the Box UID (set by the service) — read-only.
          // Label + dispatched flag come from the outward-status master table.
          if (c.key === "outward_status") {
            // Source of truth: the Status service (Dispatched → Received).
            const st = lineStatus.statusOf(row.sap_reference_id, "outward");
            if (st) return <Chip tone={CHIP_TONE[st.tone]}>{st.label}</Chip>;
            // Status service not answered yet — fall back to the line's own column.
            const code =
              out.outward_status ??
              (out.box_uid && availableBoxUids.has(out.box_uid) ? DISPATCHED : "NEW");
            const def = statusDef.get(code);
            const dispatched =
              def?.dispatched ??
              (code === DISPATCHED ||
                (!!out.box_uid && availableBoxUids.has(out.box_uid)));
            const label = def?.label ?? (dispatched ? "Dispatched" : "Yet to Dispatch");
            return <Chip tone={dispatched ? "success" : "warning"}>{label}</Chip>;
          }

          // Box UID: once the line is dispatched the UID is frozen (read-only).
          if (c.key === "box_uid") {
            const dispatched =
              out.outward_status === DISPATCHED ||
              (!!out.box_uid && availableBoxUids.has(out.box_uid));
            if (dispatched && out.box_uid) {
              return (
                <Chip
                  tone="success"
                  title="Locked — this line is dispatched"
                  icon={<Lock className="size-3" />}
                >
                  <Highlight text={out.box_uid} query={search} />
                </Chip>
              );
            }
            return (
              <OutwardCell
                field="box_uid"
                kind="text"
                value={out.box_uid}
                display={{ kind: "chip", tone: "warning" }}
                placeholderTone="orange"
                highlight={search}
                selectOnFocus
                uppercase
                onSave={(v) => patchOutward(out.sap_reference_id, { box_uid: v })}
              />
            );
          }

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
              key: "__rack",
              header: "Location",
              sortable: false,
              align: "left" as const,
              render: (row: SapInwardRecord) => {
                const q =
                  row.lot_no || row.model_no || outwardByRef.get(row.sap_reference_id)?.lot_no;
                if (!q) return <span className="text-text-muted">—</span>;
                return (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/rack-locator?q=${encodeURIComponent(String(q))}`)
                    }
                    title={`Locate ${q} in the racks`}
                    className="ds-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary"
                  >
                    <MapPin className="size-3" />
                    Rack
                  </button>
                );
              },
            },
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
      updateRecord.isPending,
      serialOf,
      outwardByRef,
      vendorName,
      availableBoxUids,
      statusDef,
      movementInfo,
      search,
      lineStatus.statusOf,
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
        toolbar={
          <div
            role="tablist"
            aria-label="Outward lines"
            className="inline-flex rounded-[var(--radius-md)] border border-border bg-surface-2 p-0.5"
          >
            {(
              [
                ["open", "Main Table"],
                ["completed", "Complete Table"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "ds-focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1 text-xs font-medium transition-colors",
                  tab === key
                    ? "bg-primary-light text-primary shadow-[var(--shadow-sm)]"
                    : "text-text-secondary hover:text-text",
                )}
              >
                {label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] tabular-nums",
                    tab === key ? "bg-white/60 text-primary" : "bg-surface text-text-muted",
                  )}
                >
                  {tabTotals[key] ?? "—"}
                </span>
              </button>
            ))}
          </div>
        }
        emptyContent={
          search ? (
            <div className="px-6 py-14 text-center text-sm text-text-secondary">
              No records match “{search}”.
            </div>
          ) : tab === "completed" ? (
            <div className="px-6 py-14 text-center text-sm text-text-secondary">
              No received lines yet — a line moves here when its Box UID is scanned on SAP
              Inward.
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
            ? { kind: docView.kind, line: docRow, vendorLabel: documentVendor(docRow) }
            : null
        }
        onClose={closeDoc}
      />
    </>
  );
}

function OutwardCell({
  field,
  kind,
  value,
  optionLabel,
  display,
  placeholderTone,
  highlight,
  selectOnFocus,
  uppercase,
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
  onSave: (v: string | number | null) => void | boolean | Promise<void | boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const committing = useRef(false);
  const label = (o: string) => (optionLabel ? optionLabel(o) : o);
  const shown = value == null || value === "" ? null : label(String(value));

  async function commit() {
    if (committing.current) return;
    const norm = draft.trim();
    const current = value == null ? "" : String(value);
    if (norm === current) {
      setEditing(false);
      return;
    }
    committing.current = true;
    const res = await onSave(norm === "" ? null : kind === "number" ? Number(norm) : norm);
    committing.current = false;
    if (res === false) {
      // Rejected (duplicate / locked / not in master). Stay in edit mode and
      // reselect the whole value so the next scan replaces it in one shot.
      setEditing(true);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    } else {
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

  return (
    <input
      ref={inputRef}
      autoFocus
      type={kind === "number" ? "number" : "text"}
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onFocus={selectOnFocus ? (e) => e.currentTarget.select() : undefined}
      onChange={(e) => setDraft(uppercase ? e.target.value.toUpperCase() : e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        }
        if (e.key === "Escape") {
          setDraft(value == null ? "" : String(value));
          setEditing(false);
        }
      }}
      className={`h-8 w-32 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-xs text-text outline-none focus:border-primary${
        uppercase ? " uppercase" : ""
      }`}
    />
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
