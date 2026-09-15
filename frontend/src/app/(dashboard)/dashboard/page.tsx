import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { OpsFlow } from "@/features/ops-flow/components/OpsFlow";
import { ProjectStats } from "@/features/projects/components/ProjectStats";
import { ProjectList } from "@/features/projects/components/ProjectList";

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

      <div className="mt-8">
        <ProjectStats />
      </div>

      <section className="ds-animate-fade-up mt-8" style={{ animationDelay: "120ms" }}>
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Your projects</h3>
          <p className="text-xs text-text-secondary">Work areas you own or collaborate on.</p>
        </div>
        <Suspense fallback={<TableSkeleton />}>
          <ProjectList />
        </Suspense>
      </section>
    </>
  );
}
