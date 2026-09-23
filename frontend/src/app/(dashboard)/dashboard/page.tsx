import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { OpsFlow } from "@/features/ops-flow/components/OpsFlow";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Operations Overview"
        description="Live snapshot of the work areas you own or collaborate on."
        breadcrumbs={[{ label: "TITAN", href: "/dashboard" }, { label: "Overview" }]}
      />

      <OpsFlow />
    </>
  );
}
