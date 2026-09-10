import type { Metadata } from "next";
import { PackageCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Polishing Return" };

export default function PolishingReturnPage() {
  return (
    <>
      <PageHeader
        title="Polishing Return"
        description="Receive and verify lots returned from polishing vendors."
        breadcrumbs={[{ label: "Polishing Return" }]}
      />
      <div className="rounded-[var(--radius-md)] border border-border bg-surface">
        <EmptyState
          icon={<PackageCheck />}
          title="No returns to receive"
          description="Lots sent for polishing will appear here when they are returned."
        />
      </div>
    </>
  );
}
