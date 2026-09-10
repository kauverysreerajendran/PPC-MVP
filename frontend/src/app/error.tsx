"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the observability pipeline; never render raw stack traces to users.
    console.error("app_error", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--color-danger-bg)] text-[var(--color-danger)]">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-text-secondary">
          We couldn&apos;t complete this request. Please try again, or contact the
          system administrator if the problem continues.
        </p>
        {error.digest ? (
          <p className="mt-2 text-[11px] text-text-muted">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={reset}>Retry</Button>
          <Link
            href="/dashboard"
            className="ds-focus-ring inline-flex h-9 items-center justify-center rounded-[var(--radius-sm)] border border-border-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
