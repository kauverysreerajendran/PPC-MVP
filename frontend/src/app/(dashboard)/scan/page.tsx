import type { Metadata } from "next";
import { ScanLine } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Scan" };

export default function ScanPage() {
  return (
    <>
      <PageHeader
        title="Scan"
        description="Scan a lot barcode or QR code to open its station workflow."
        breadcrumbs={[{ label: "Scan" }]}
      />
      <div className="rounded-[var(--radius-md)] border border-border bg-surface">
        <EmptyState
          icon={<ScanLine />}
          title="Scanner idle"
          description="Scan a lot to begin. Station workflows open here once a lot is identified."
        />
      </div>
    </>
  );
}
