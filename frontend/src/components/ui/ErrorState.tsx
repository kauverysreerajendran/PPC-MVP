import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { ApiError } from "@/lib/api/errors";

/** Message for an error the API client raised; precise for a down service. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "service_unavailable") return `${err.message}. Start it and the data will load automatically.`;
    return err.displayMessage;
  }
  if (err instanceof Error && err.name === "NetworkError") return "No connection to the server.";
  return "Something went wrong while retrieving the data. Please try again.";
}

export function ErrorState({
  title = "Unable to load data",
  description,
  error,
  onRetry,
  action,
}: {
  title?: string | undefined;
  description?: ReactNode;
  /** The caught error; when given and `description` is not, a precise message is derived. */
  error?: unknown;
  onRetry?: (() => void) | undefined;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-[var(--color-danger-bg)] text-[var(--color-danger)] [&>svg]:size-5">
        <AlertTriangle />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-text-secondary">
        {description ?? describeError(error)}
      </p>
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
