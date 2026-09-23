"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";
import { ToastProvider } from "@/components/ui";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // lib/api/client.ts already retries idempotent requests once and
            // fails instantly when the owning service is down, so React Query
            // adds at most one more attempt — and never for a 4xx or for a
            // service that is not running (retrying only delays the message;
            // polling picks the service up again when it returns).
            retry: (failureCount, err) => {
              if (err instanceof ApiError && (err.status < 500 || err.status === 503)) return false;
              return failureCount < 1;
            },
            retryDelay: 500,
            // Reflect out-of-band DB changes (e.g. edits made in the DB admin)
            // when the network returns. Refetch-on-focus is opted into per
            // query in lib/polling.ts (docs/09 §8.1 — do not refetch what has
            // not changed), so switching tabs does not re-run every query.
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
