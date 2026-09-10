import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableSkeleton } from "@/components/ui/Skeleton";
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

      <ProjectStats />

      <section className="mt-8">
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
