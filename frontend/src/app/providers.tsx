"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";
import { ToastProvider } from "@/components/ui";
import { NetworkActivity } from "@/components/shell/NetworkActivity";

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
            // as soon as the user comes back to the app or the network returns.
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <NetworkActivity />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
