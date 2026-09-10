"use client";

import { useState } from "react";
import { Route, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function TraceabilityPage() {
  const [q, setQ] = useState("");

  return (
    <>
      <PageHeader
        title="Traceability"
        description="Follow any lot, serial, jig or operator through its full production history."
        breadcrumbs={[{ label: "Traceability" }]}
      />

      <div className="relative mb-6 max-w-lg">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Lot number, serial, jig ID, operator…"
          className="h-10 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-primary)_25%,transparent)]"
        />
      </div>

      <div className="rounded-[var(--radius-md)] border border-border bg-surface">
        <EmptyState
          icon={<Route />}
          title={q ? "No history found" : "Search to trace a lot"}
          description={
            q
              ? `Nothing matches “${q}”.`
              : "Enter a lot number, serial, jig ID or operator to see its production history."
          }
        />
      </div>
    </>
  );
}
