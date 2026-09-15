import { api, type RequestOptions } from "@/lib/api/client";
import type { Page } from "@/features/masterdata/types";
import type { LineStatus, StatusDefinition, StatusStage } from "./types";

/**
 * Talks to the Status microservice via the gateway path `/api/v1/status`.
 * `next.config.ts` rewrites that prefix to the service (default :8004).
 * Read-only from the browser: statuses change as a side effect of business
 * actions (scan, verify, place) in the owning services.
 */
export const statusApi = {
  definitions: (opts: RequestOptions = {}) =>
    api.get<StatusDefinition[]>("/status/definitions", opts),

  lines: (
    params: {
      stage?: StatusStage;
      code?: string;
      /** comma-separated sap_reference_ids */
      refs?: string;
      page?: number;
      page_size?: number;
    },
    opts: RequestOptions = {},
  ) => api.get<Page<LineStatus>>("/status/lines", { ...opts, query: { ...params } }),
};
