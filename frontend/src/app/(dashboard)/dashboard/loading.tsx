import { KpiSkeleton, TableSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <div className="mb-5 space-y-2 border-b border-border pb-4">
        <div className="ds-skeleton h-3 w-40" />
        <div className="ds-skeleton h-6 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
      <div className="mt-8">
        <TableSkeleton />
      </div>
    </>
  );
}
