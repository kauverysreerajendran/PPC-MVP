import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Throughput, cycle-time and vendor performance analytics."
        breadcrumbs={[{ label: "Analytics" }]}
      />
      <div className="rounded-[var(--radius-md)] border border-border bg-surface">
        <EmptyState
          icon={<BarChart3 />}
          title="No analytics yet"
          description="Charts are built from production activity and will appear here."
        />
      </div>
    </>
  );
}
