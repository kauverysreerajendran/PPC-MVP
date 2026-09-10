import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Operational and quality reports across the production system."
        breadcrumbs={[{ label: "Insights" }, { label: "Reports" }]}
      />
      <div className="rounded-[var(--radius-md)] border border-border bg-surface">
        <EmptyState
          icon={<BarChart3 />}
          title="No reports available"
          description="Reports are generated from production activity and will appear here."
        />
      </div>
    </>
  );
}
