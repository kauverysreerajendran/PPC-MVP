import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Notifications"
        description="System and workflow notifications across the production system."
        breadcrumbs={[{ label: "Notifications" }]}
      />
      <div className="rounded-[var(--radius-md)] border border-border bg-surface">
        <EmptyState
          icon={<Bell />}
          title="No notifications"
          description="Updates from SAP syncs, inspections and rack movements will appear here."
        />
      </div>
    </>
  );
}
