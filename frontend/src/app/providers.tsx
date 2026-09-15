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
            retry: (failureCount, err) => {
              if (err instanceof ApiError && err.status < 500) return false;
              return failureCount < 2;
            },
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
