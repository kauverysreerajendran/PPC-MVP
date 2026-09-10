import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Alerts" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Alerts"
        description="Exceptions and faults that need operator attention."
        breadcrumbs={[{ label: "Alerts" }]}
      />
      <div className="rounded-[var(--radius-md)] border border-border bg-surface">
        <EmptyState
          icon={<Bell />}
          title="No active alerts"
          description="Exceptions raised on the shop floor will appear here."
        />
      </div>
    </>
  );
}
