import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Inspection" };

export default function InspectionPage() {
  return (
    <>
      <PageHeader
        title="In-Process Inspection"
        description="Record parameter results and finalize the quality verdict for a lot."
        breadcrumbs={[{ label: "Production" }, { label: "Inspection" }]}
      />
      <div className="rounded-[var(--radius-md)] border border-border bg-surface">
        <EmptyState
          icon={<ClipboardCheck />}
          title="No lots awaiting inspection"
          description="Lots routed to inspection will appear here."
        />
      </div>
    </>
  );
}
