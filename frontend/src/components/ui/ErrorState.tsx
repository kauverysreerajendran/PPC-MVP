import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

export function ErrorState({
  title = "Unable to load data",
  description = "Something went wrong while retrieving the data. Please try again.",
  onRetry,
  action,
}: {
  title?: string | undefined;
  description?: ReactNode;
  onRetry?: (() => void) | undefined;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-[var(--color-danger-bg)] text-[var(--color-danger)] [&>svg]:size-5">
        <AlertTriangle />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-text-secondary">{description}</p>
      <div className="mt-4 flex gap-2">
        {onRetry ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
        {action}
      </div>
    </div>
  );
}
