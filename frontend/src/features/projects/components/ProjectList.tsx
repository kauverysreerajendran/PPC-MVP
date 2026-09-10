"use client";

import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchBar } from "@/components/ui/SearchBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Pagination } from "@/components/ui/Pagination";
import type { Project } from "@/lib/api/types";
import { useProjects } from "../hooks";

const PAGE_SIZE = 10;

export function ProjectList() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const { data, isLoading, isError, refetch, isFetching } = useProjects({
    page,
    size: PAGE_SIZE,
  });

  const rows = useMemo(() => {
    const list = data?.data ?? [];
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.description ?? "").toLowerCase().includes(needle),
    );
  }, [data, q]);

  const columns: Column<Project>[] = [
    {
      key: "name",
      header: "Project",
      sortable: true,
      accessor: (p) => p.name,
      render: (p) => (
        <div>
          <p className="font-medium text-text">{p.name}</p>
          {p.description ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">{p.description}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      accessor: (p) => p.status,
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: "updated_at",
      header: "Updated",
      align: "right",
      sortable: true,
      accessor: (p) => p.updated_at,
      render: (p) => (
        <span className="text-xs text-text-secondary">
          {new Date(p.updated_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  const pagination = data?.pagination;

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(p) => p.id}
      loading={isLoading}
      error={isError}
      onRetry={() => void refetch()}
      initialSort={{ key: "updated_at", dir: "desc" }}
      emptyTitle="No projects found"
      emptyDescription={
        q ? "No projects match your search." : "There are no projects yet."
      }
      toolbar={
        <>
          <SearchBar
            value={q}
            onChange={setQ}
            placeholder="Search projects…"
            className="w-full sm:max-w-xs"
          />
          {isFetching ? (
            <span className="text-xs text-text-muted">Refreshing…</span>
          ) : null}
        </>
      }
      footer={
        pagination ? (
          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            total={pagination.total}
            size={pagination.size}
            onPageChange={setPage}
          />
        ) : null
      }
    />
  );
}
