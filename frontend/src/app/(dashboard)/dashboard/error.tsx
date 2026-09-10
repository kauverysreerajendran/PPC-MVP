"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("dashboard_error", error);
  }, [error]);

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface">
      <ErrorState
        title="Unable to load the dashboard"
        description="Something went wrong while retrieving production data. Your session is still active."
        onRetry={reset}
      />
    </div>
  );
}
