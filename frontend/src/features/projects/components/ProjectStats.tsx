"use client";

import { Boxes, CircleDot, Archive } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { useProjects } from "../hooks";

/**
 * Live project KPIs derived entirely from the projects API — no static data.
 * Counts by status are computed over the fetched window; the total comes from
 * the server-side pagination envelope.
 */
export function ProjectStats() {
  const { data, isLoading } = useProjects({ page: 1, size: 100 });

  const list = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const active = list.filter((p) => p.status === "active").length;
  const archived = list.filter((p) => p.status === "archived").length;
  const dash = isLoading ? "—" : undefined;

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <KpiCard label="Total Projects" value={dash ?? total} icon={<Boxes />} />
      <KpiCard label="Active" value={dash ?? active} icon={<CircleDot />} tone="info" />
      <KpiCard label="Archived" value={dash ?? archived} icon={<Archive />} tone="warning" />
    </section>
  );
}
