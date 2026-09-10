import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-muted">
          <Compass className="size-6" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          Error 404
        </p>
        <h1 className="mt-1 text-lg font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-text-secondary">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="ds-focus-ring mt-5 inline-flex h-9 items-center justify-center rounded-[var(--radius-sm)] bg-primary px-4 text-sm font-medium text-[var(--color-primary-fg)] hover:bg-[var(--color-primary-hover)]"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
