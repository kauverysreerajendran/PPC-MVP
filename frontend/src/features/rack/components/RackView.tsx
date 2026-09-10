"use client";

import { useMemo, useState } from "react";
import { LogIn, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchBar } from "@/components/ui/SearchBar";
import { Pagination } from "@/components/ui/Pagination";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal, ConfirmationModal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { usePageSize } from "@/lib/usePageSize";
import { ApiError } from "@/lib/api/errors";
import {
  useRackCreate,
  useRackDelete,
  useRackList,
  useRackOccupy,
  useRackRelease,
  useRackUpdate,
} from "../hooks";
import type { RackListParams, RackSlot } from "../types";

const EMPTY = { rack_code: "", row_no: "", column_no: "", shelf_no: "", location_name: "", notes: "" };

export function RackView() {
  const [search, setSearch] = useState("");
  const [occupiedFilter, setOccupiedFilter] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("rack_code");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const PAGE_SIZE = usePageSize();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RackSlot | null>(null);
  const [form, setForm] = useState<Record<string, string>>(EMPTY);

  const [occupyFor, setOccupyFor] = useState<RackSlot | null>(null);
  const [occupyModel, setOccupyModel] = useState("");
  const [toDelete, setToDelete] = useState<RackSlot | null>(null);
  const [toRelease, setToRelease] = useState<RackSlot | null>(null);

  const toast = useToast();
  const create = useRackCreate();
  const update = useRackUpdate();
  const del = useRackDelete();
  const occupy = useRackOccupy();
  const release = useRackRelease();

  const params = useMemo<RackListParams>(() => {
    const p: RackListParams = { page, page_size: PAGE_SIZE, sort, direction };
    if (search.trim()) p.search = search.trim();
    if (occupiedFilter) p.occupied = occupiedFilter === "true";
    return p;
  }, [page, sort, direction, search, occupiedFilter, PAGE_SIZE]);

  const list = useRackList(params);
  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function onSortChange(key: string) {
    if (sort === key) setDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDirection("asc");
    }
    setPage(1);
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  }

  function openEdit(row: RackSlot) {
    setEditing(row);
    setForm({
      rack_code: row.rack_code,
      row_no: String(row.row_no),
      column_no: String(row.column_no),
      shelf_no: String(row.shelf_no),
      location_name: row.location_name ?? "",
      notes: row.notes ?? "",
    });
    setFormOpen(true);
  }

  async function submitForm() {
    const g = (k: string) => (form[k] ?? "").trim();
    const body: Record<string, unknown> = {
      rack_code: g("rack_code"),
      row_no: Number(g("row_no")),
      column_no: Number(g("column_no")),
      shelf_no: Number(g("shelf_no")),
    };
    if (g("location_name")) body.location_name = g("location_name");
    if (g("notes")) body.notes = g("notes");
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, body });
        toast("success", "Slot updated");
      } else {
        await create.mutateAsync(body);
        toast("success", "Slot created");
      }
      setFormOpen(false);
    } catch (err) {
      toast("error", err instanceof ApiError ? err.displayMessage : "Save failed");
    }
  }

  async function submitOccupy() {
    if (!occupyFor || !occupyModel.trim()) return;
    try {
      await occupy.mutateAsync({
        id: occupyFor.id,
        body: { occupied_by_model: occupyModel.trim() },
      });
      toast("success", `Slot occupied by ${occupyModel.trim()}`);
      setOccupyFor(null);
      setOccupyModel("");
    } catch (err) {
      toast("error", err instanceof ApiError ? err.displayMessage : "Occupy failed");
    }
  }

  const columns: Column<RackSlot>[] = [
    { key: "rack_code", header: "Rack", render: (r) => r.rack_code },
    {
      key: "location_name",
      header: "Location",
      render: (r) => r.location_name ?? <span className="text-text-muted">—</span>,
    },
    { key: "row_no", header: "Row", align: "right", render: (r) => r.row_no },
    { key: "column_no", header: "Col", align: "right", render: (r) => r.column_no },
    { key: "shelf_no", header: "Shelf", align: "right", render: (r) => r.shelf_no },
    {
      key: "occupied",
      header: "Occupied",
      render: (r) => (
        <span className={r.occupied ? "text-text" : "text-text-muted"}>
          {r.occupied ? "Yes" : "No"}
        </span>
      ),
    },
    {
      key: "occupied_by_model",
      header: "Model No",
      render: (r) => r.occupied_by_model ?? <span className="text-text-muted">—</span>,
    },
    {
      key: "date_of_occupied",
      header: "Occupied On",
      render: (r) =>
        r.date_of_occupied ? (
          new Date(r.date_of_occupied).toLocaleDateString()
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "_actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          {r.occupied ? (
            <button
              type="button"
              aria-label="Release"
              onClick={() => setToRelease(r)}
              className="ds-focus-ring rounded p-1 text-text-muted hover:bg-surface-2 hover:text-text"
            >
              <LogOut className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Occupy"
              onClick={() => {
                setOccupyFor(r);
                setOccupyModel("");
              }}
              className="ds-focus-ring rounded p-1 text-text-muted hover:bg-surface-2 hover:text-text"
            >
              <LogIn className="size-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Edit"
            onClick={() => openEdit(r)}
            className="ds-focus-ring rounded p-1 text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Deactivate"
            onClick={() => setToDelete(r)}
            className="ds-focus-ring rounded p-1 text-text-muted hover:bg-surface-2 hover:text-[var(--color-danger)]"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ),
    },
  ];

  const SORTS = [
    ["rack_code", "Rack"],
    ["row_no", "Row"],
    ["column_no", "Col"],
    ["shelf_no", "Shelf"],
    ["occupied_by_model", "Model No"],
    ["date_of_occupied", "Occupied On"],
  ] as const;

  return (
    <>
      <PageHeader
        title="Racks"
        description="Physical rack slots and their live occupancy — owned by the Rack service (rack database)."
        breadcrumbs={[{ label: "Racks" }]}
      />

      <DataTable<RackSlot>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={list.isLoading}
        error={list.isError}
        onRetry={() => void list.refetch()}
        emptyTitle="No rack slots"
        emptyDescription="Create a slot, or load the RACK-K chart via the Alembic seed migration."
        toolbar={
          <>
            <SearchBar
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search rack, location, model…"
              className="w-64"
            />
            <select
              value={occupiedFilter}
              onChange={(e) => {
                setOccupiedFilter(e.target.value as "" | "true" | "false");
                setPage(1);
              }}
              className="rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 py-1.5 text-sm"
            >
              <option value="">All slots</option>
              <option value="true">Occupied</option>
              <option value="false">Empty</option>
            </select>
            {list.isFetching ? (
              <span className="text-xs text-text-muted">Refreshing…</span>
            ) : null}
            <div className="ml-auto">
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" aria-hidden />
                New Slot
              </Button>
            </div>
          </>
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

      <div className="mt-2 flex flex-wrap gap-1 text-xs text-text-muted">
        <span>Sort:</span>
        {SORTS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onSortChange(key)}
            className={
              sort === key
                ? "rounded bg-surface-2 px-1.5 text-text"
                : "rounded px-1.5 hover:text-text-secondary"
            }
          >
            {label}
            {sort === key ? (direction === "asc" ? " ▲" : " ▼") : ""}
          </button>
        ))}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit Slot" : "New Slot"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitForm}
              loading={create.isPending || update.isPending}
            >
              {editing ? "Save changes" : "Create"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Rack Code"
            required
            value={form.rack_code ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, rack_code: e.target.value }))}
          />
          <Input
            label="Location Name"
            value={form.location_name ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, location_name: e.target.value }))}
          />
          <Input
            label="Row No"
            type="number"
            required
            value={form.row_no ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, row_no: e.target.value }))}
          />
          <Input
            label="Column No"
            type="number"
            required
            value={form.column_no ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, column_no: e.target.value }))}
          />
          <Input
            label="Shelf No"
            type="number"
            required
            value={form.shelf_no ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, shelf_no: e.target.value }))}
          />
          <Input
            label="Notes"
            value={form.notes ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </Modal>

      <Modal
        open={occupyFor != null}
        onClose={() => setOccupyFor(null)}
        title="Occupy Slot"
        description={
          occupyFor
            ? `${occupyFor.rack_code} · ${occupyFor.location_name ?? ""} (r${occupyFor.row_no}/c${occupyFor.column_no}/s${occupyFor.shelf_no})`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setOccupyFor(null)}>
              Cancel
            </Button>
            <Button onClick={submitOccupy} loading={occupy.isPending}>
              Occupy
            </Button>
          </>
        }
      >
        <Input
          label="Occupied by Model No"
          required
          value={occupyModel}
          onChange={(e) => setOccupyModel(e.target.value)}
        />
        <p className="mt-2 text-xs text-text-muted">
          Sets occupied = true and stamps date_of_occupied with the current time.
        </p>
      </Modal>

      <ConfirmationModal
        open={toRelease != null}
        onClose={() => setToRelease(null)}
        onConfirm={async () => {
          if (!toRelease) return;
          try {
            await release.mutateAsync(toRelease.id);
            toast("success", "Slot released");
          } catch {
            toast("error", "Release failed");
          } finally {
            setToRelease(null);
          }
        }}
        title="Release this slot?"
        message="Clears the model, occupied flag and occupied date. The slot record stays."
        confirmLabel="Release"
        loading={release.isPending}
      />

      <ConfirmationModal
        open={toDelete != null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await del.mutateAsync(toDelete.id);
            toast("success", "Slot deactivated");
          } catch {
            toast("error", "Delete failed");
          } finally {
            setToDelete(null);
          }
        }}
        title="Deactivate this slot?"
        message="The slot is marked inactive (soft delete) so history stays valid."
        confirmLabel="Deactivate"
        tone="danger"
        loading={del.isPending}
      />
    </>
  );
}
