import { KpiSkeleton, TableSkeleton } from "./Skeleton";

/** Generic page-loading placeholder used by route-level loading.tsx files. */
export function PageSkeleton({
  kpis = 0,
  table = true,
}: {
  kpis?: number;
  table?: boolean;
}) {
  return (
    <div className="ds-animate-fade">
      <div className="mb-5 space-y-2 border-b border-border pb-4">
        <div className="ds-skeleton h-3 w-40" />
        <div className="ds-skeleton h-6 w-56" />
        <div className="ds-skeleton h-3 w-72" />
      </div>
      {kpis > 0 ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: kpis }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : null}
      {table ? <TableSkeleton rows={8} /> : <div className="ds-skeleton h-64 w-full rounded-[var(--radius-md)]" />}
    </div>
  );
}
