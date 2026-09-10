"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchBar } from "@/components/ui/SearchBar";
import { Pagination } from "@/components/ui/Pagination";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmationModal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { usePageSize } from "@/lib/usePageSize";
import { ApiError } from "@/lib/api/errors";
import type { FieldDef, ResourceConfig } from "../config";
import { useMdDelete, useMdList, useMdUpdate } from "../hooks";
import type { ListParams, MdRecord } from "../types";
import { ResourceFormModal } from "./ResourceFormModal";

function value(row: MdRecord, key: string): string | number | null {
  const v = (row as unknown as Record<string, unknown>)[key];
  return v == null ? null : (v as string | number);
}

/** "416.000" -> "416", "416.5000" -> "416.5", keeps non-numeric text as-is. */
function formatNumber(v: string | number): string {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(v);
}

function InlineEditCell({
  row,
  field,
  onSave,
}: {
  row: MdRecord;
  field: FieldDef;
  onSave: (raw: string) => Promise<void>;
}) {
  const current = value(row, field.name);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span>{current == null || current === "" ? "—" : formatNumber(current)}</span>
        <button
          type="button"
          aria-label={`Edit ${field.label}`}
          onClick={() => {
            setDraft(current == null ? "" : String(current));
            setEditing(true);
          }}
          className="ds-focus-ring rounded p-0.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <Pencil className="size-3.5" />
        </button>
      </span>
    );
  }

  const commit = async () => {
    setBusy(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      {field.options ? (
        <select
          autoFocus
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          className="rounded-[var(--radius-sm)] border border-border-strong bg-surface px-1.5 py-0.5 text-sm outline-none focus:border-primary"
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          autoFocus
          type={field.type === "number" ? "number" : "text"}
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-24 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-1.5 py-0.5 text-right text-sm outline-none focus:border-primary"
        />
      )}
      <button
        type="button"
        aria-label="Save"
        onClick={() => void commit()}
        disabled={busy}
        className="ds-focus-ring rounded p-0.5 text-[var(--color-success)] hover:bg-surface-2"
      >
        <Check className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Cancel"
        onClick={() => setEditing(false)}
        disabled={busy}
        className="ds-focus-ring rounded p-0.5 text-text-muted hover:bg-surface-2"
      >
        <X className="size-4" />
      </button>
    </span>
  );
}

export function ResourcePanel({ config }: { config: ResourceConfig }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(config.defaultSort);
  const [direction, setDirection] = useState<"asc" | "desc">(
    config.defaultSort === "transaction_date" ? "desc" : "asc",
  );
  const [editing, setEditing] = useState<MdRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<MdRecord | null>(null);

  const pageSize = usePageSize();

  const params = useMemo<ListParams>(() => {
    const p: ListParams = { page, page_size: pageSize, sort, direction };
    if (search.trim()) p.search = search.trim();
    return p;
  }, [page, search, sort, direction, pageSize]);

  const list = useMdList<MdRecord>(config.resource, params);
  const del = useMdDelete(config.resource);
  const update = useMdUpdate<MdRecord>(config.resource);
  const toast = useToast();

  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const saveField = useCallback(
    async (row: MdRecord, field: FieldDef, raw: string) => {
      try {
        await update.mutateAsync({
          id: (row as { id: string }).id,
          body: { [field.name]: raw === "" ? null : raw },
        });
        toast("success", `${field.label} updated`);
      } catch (err) {
        toast("error", err instanceof ApiError ? err.displayMessage : "Update failed");
        throw err;
      }
    },
    [update, toast],
  );

  const columns: Column<MdRecord>[] = useMemo(() => {
    const defs = config.fields.filter((f) => f.inTable);
    const cols: Column<MdRecord>[] = defs.map((f) => ({
      key: f.name,
      header: f.label,
      ...(f.align ? { align: f.align } : {}),
      accessor: (row) => value(row, f.name),
      render: (row) => {
        if (f.inlineEditable) {
          return (
            <InlineEditCell
              row={row}
              field={f}
              onSave={(raw) => saveField(row, f, raw)}
            />
          );
        }
        const v = value(row, f.name);
        if (f.name === "status") return <StatusBadge status={String(v ?? "active")} />;
        if (v == null || v === "") return <span className="text-text-muted">—</span>;
        if (f.type === "datetime") return new Date(String(v)).toLocaleString();
        if (f.type === "number") return formatNumber(v);
        return String(v);
      },
    }));
    cols.push({
      key: "_actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            aria-label="Edit"
            onClick={() => {
              setEditing(row);
              setFormOpen(true);
            }}
            className="ds-focus-ring rounded p-1 text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Deactivate"
            onClick={() => setToDelete(row)}
            className="ds-focus-ring rounded p-1 text-text-muted hover:bg-surface-2 hover:text-[var(--color-danger)]"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ),
    });
    return cols;
  }, [config, saveField]);

  function onSortChange(key: string) {
    if (sort === key) setDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDirection("asc");
    }
    setPage(1);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await del.mutateAsync((toDelete as { id: string }).id);
      toast("success", `${config.singular} deactivated`);
    } catch {
      toast("error", "Delete failed");
    } finally {
      setToDelete(null);
    }
  }

  return (
    <>
      <DataTable<MdRecord>
        columns={columns}
        rows={rows}
        rowKey={(r) => (r as { id: string }).id}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyTitle={`No ${config.label.toLowerCase()}`}
        emptyDescription="Create a record, or import from SAP where applicable."
        toolbar={
          <>
            <SearchBar
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder={`Search ${config.label.toLowerCase()}…`}
              className="w-72"
            />
            {list.isFetching ? (
              <span className="text-xs text-text-muted">Refreshing…</span>
            ) : null}
            <div className="ml-auto">
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="size-4" aria-hidden />
                New {config.singular}
              </Button>
            </div>
          </>
        }
        footer={
          <Pagination
            page={page}
            pages={pages}
            total={total}
            size={pageSize}
            onPageChange={(p) => setPage(Math.min(Math.max(1, p), pages))}
          />
        }
      />

      {/* server-side sort trigger row (DataTable sorts client-side only) */}
      <div className="mt-2 flex flex-wrap gap-1 text-xs text-text-muted">
        <span>Sort:</span>
        {config.fields
          .filter((f) => f.sortable)
          .map((f) => (
            <button
              key={f.name}
              type="button"
              onClick={() => onSortChange(f.name)}
              className={
                sort === f.name
                  ? "rounded bg-surface-2 px-1.5 text-text"
                  : "rounded px-1.5 hover:text-text-secondary"
              }
            >
              {f.label}
              {sort === f.name ? (direction === "asc" ? " ▲" : " ▼") : ""}
            </button>
          ))}
      </div>

      <ResourceFormModal
        config={config}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        record={editing}
      />
      <ConfirmationModal
        open={toDelete != null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title={`Deactivate ${config.singular}?`}
        message="The record is marked inactive (soft delete) so historical references stay valid."
        confirmLabel="Deactivate"
        tone="danger"
        loading={del.isPending}
      />
    </>
  );
}
