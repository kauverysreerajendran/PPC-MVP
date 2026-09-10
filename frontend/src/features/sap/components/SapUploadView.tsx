"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, Lock } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { usePageSize } from "@/lib/usePageSize";
import { ApiError } from "@/lib/api/errors";
import { patchOutwardByRef } from "@/features/masterdata/api";
import { useMdList, useOutwardStatusMaster } from "@/features/masterdata/hooks";
import type { Box, SapOutward, Vendor } from "@/features/masterdata/types";
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

/** Rounded categorical pill used across the SAP Outward grid. */
function Chip({
  children,
  tone,
  title,
  icon,
}: {
  children: ReactNode;
  tone?: number | "muted" | "success";
  title?: string;
  icon?: ReactNode;
}) {
  const mod = typeof tone === "number" ? `ds-chip-${tone}` : tone ? `ds-chip-${tone}` : "";
  return (
    <span className={`ds-chip ${mod}`.trim()} title={title}>
      {icon}
      <span>{children}</span>
    </span>
  );
}

/** "467.000" -> "467", "467.5" -> "467.5"; non-numeric text unchanged. */
function fmtNum(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(v);
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
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
  { key: "transaction_date", header: "Date / Timestamp", type: "date" },
  { key: "dc_no", header: "DC no" },
  { key: "po_no", header: "PO no" },
  { key: "model_no", header: "Model" },
  { key: "vendor_name", header: "Vendor" },
  { key: "batch_no", header: "Batch no" },
  { key: "movement_type", header: "SAP", align: "left" },
  { key: "quantity", header: "Lot Qty", align: "left", type: "number" },
];

/** Remark is rendered as the last column, after the outward transaction fields. */
const REMARK_DEF = { key: "remark" as const, header: "Remark", editable: true };

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
  const PAGE_SIZE = usePageSize();
  const updateRecord = useUpdateSapRecord();
  const toast = useToast();
  const qc = useQueryClient();

  const params = useMemo<ListRecordsParams>(
    () => ({ page, page_size: PAGE_SIZE }),
    [page, PAGE_SIZE],
  );

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
  const boxesList = useMdList<Box>("boxes", { page_size: 500 });
  const availableBoxUids = useMemo(() => {
    const s = new Set<string>();
    for (const b of boxesList.data?.items ?? []) {
      if (b.status === "active") s.add(b.box_uid);
    }
    return s;
  }, [boxesList.data]);

  // Outward-status lookup (masterdata) — code → label / dispatched flag.
  const statusMaster = useOutwardStatusMaster();
  const statusDef = useMemo(() => {
    const m = new Map<string, { label: string; dispatched: boolean }>();
    for (const d of statusMaster.data ?? [])
      m.set(d.code, { label: d.label, dispatched: d.is_dispatched });
    return m;
  }, [statusMaster.data]);

  const vendorsList = useMdList<Vendor>("vendors", { page_size: 500 });
  const vendorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vendorsList.data?.items ?? []) m.set(v.vendor_code, v.vendor_name);
    return m;
  }, [vendorsList.data]);

  const rows = useMemo(() => records.data?.items ?? [], [records.data]);
  const total = records.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function patch(id: string, patchBody: { remark?: string }) {
    try {
      await updateRecord.mutateAsync({ id, patch: patchBody });
      toast("success", "Record updated");
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
      toast("success", "Saved");
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
          if (c.type === "date") return fmtDate(row.transaction_date);
          if (c.editable) {
            return <RemarkCell row={row} onSave={(v) => patch(row.id, { remark: v })} />;
          }
          if (c.key === "vendor_name") {
            const out = outwardByRef.get(row.sap_reference_id);
            if (!out) {
              const name = row.vendor_code ? vendorName.get(row.vendor_code) : undefined;
              return name ? (
                <Chip tone={hueOf(name)}>{name}</Chip>
              ) : (
                <span className="text-text-muted">—</span>
              );
            }
            // Editable code → the Masterdata service rejects anything that
            // isn't a registered vendor; the cell shows the resolved name.
            return (
              <OutwardCell
                field="vendor_code"
                kind="text"
                value={out.vendor_code}
                optionLabel={(code) => vendorName.get(code) ?? code}
                onSave={(v) => patchOutward(out.sap_reference_id, { vendor_code: v })}
              />
            );
          }
          const v = cell(row, c.key);
          if (v == null || v === "") return <span className="text-text-muted">—</span>;

          if (c.key === "dc_no" || c.key === "po_no") {
            return <span className="ds-cell-id">{String(v)}</span>;
          }
          if (c.key === "model_no") {
            return <Chip tone={hueOf(String(v))}>{String(v)}</Chip>;
          }
          if (c.key === "movement_type") {
            return <Chip tone={2}>{String(v)}</Chip>;
          }
          if (c.type === "number") return fmtNum(v);
          return String(v);
        },
      })),
      ...(
        [
          { key: "tray_type", header: "Tray Type", type: "text" },
          { key: "no_of_trays", header: "No. of Trays", type: "number" },
          { key: "front_case_trays", header: "Front Case Trays", type: "number" },
          { key: "back_case_trays", header: "Back Case Trays", type: "number" },
          { key: "box_uid", header: "Box UID", type: "text" },
          { key: "outward_status", header: "Outward Status", type: "text" },
        ] as const
      ).map((c) => ({
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
            const code =
              out.outward_status ??
              (out.box_uid && availableBoxUids.has(out.box_uid) ? DISPATCHED : "NEW");
            const def = statusDef.get(code);
            const dispatched =
              def?.dispatched ??
              (code === DISPATCHED ||
                (!!out.box_uid && availableBoxUids.has(out.box_uid)));
            const label = def?.label ?? (dispatched ? "Dispatched" : "Yet to Dispatch");
            return <Chip tone={dispatched ? "success" : "muted"}>{label}</Chip>;
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
                  {out.box_uid}
                </Chip>
              );
            }
            return (
              <OutwardCell
                field="box_uid"
                kind="text"
                value={out.box_uid}
                display={{ kind: "chip", tone: 0 }}
                selectOnFocus
                onSave={(v) => patchOutward(out.sap_reference_id, { box_uid: v })}
              />
            );
          }

          const NUM_HUE: Record<string, number> = {
            no_of_trays: 6,
            front_case_trays: 1,
            back_case_trays: 3,
          };
          const display: { kind: "chip" | "num"; tone: number } | undefined =
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
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateRecord.isPending, serialOf, outwardByRef, vendorName, availableBoxUids, statusDef],
  );

  return (
    <>
      <SapPageBanner />

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
        emptyContent={<SapEmptyState />}
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
    </>
  );
}

function OutwardCell({
  field,
  kind,
  value,
  optionLabel,
  display,
  selectOnFocus,
  onSave,
}: {
  field: string;
  kind: "text" | "number";
  value: string | number | null;
  optionLabel?: (o: string) => string;
  display?: { kind: "chip" | "num"; tone: number };
  /** select all on focus so a barcode scan overwrites the current value */
  selectOnFocus?: boolean;
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
    let content: ReactNode = (
      <span className="text-text-muted">Set {field.replace(/_/g, " ")}…</span>
    );
    if (shown != null) {
      if (display?.kind === "chip") content = <Chip tone={display.tone}>{shown}</Chip>;
      else if (display?.kind === "num")
        content = <span className={`ds-num ds-chip-${display.tone}`}>{shown}</span>;
      else content = shown;
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
      onChange={(e) => setDraft(e.target.value)}
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
      className="h-8 w-32 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-xs text-text outline-none focus:border-primary"
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
