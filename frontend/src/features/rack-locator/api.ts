import { api, type RequestOptions } from "@/lib/api/client";
import type { LocateResult, RackDetail, ResolveResult, Topology } from "./types";

/**
 * Read side of the Rack microservice, via the gateway path `/api/v1/rack`.
 * `next.config.ts` rewrites that prefix to the service (default :8003).
 */
export const rackLocatorApi = {
  topology: (
    params: { warehouse_code?: string; aisle_code?: string } = {},
    opts: RequestOptions = {},
  ) => api.get<Topology>("/rack/topology", { ...opts, query: { ...params } }),

  rack: (
    params: { warehouse_code: string; aisle_code: string; rack_code: string },
    opts: RequestOptions = {},
  ) =>
    api.get<RackDetail>(`/rack/racks/${encodeURIComponent(params.rack_code)}`, {
      ...opts,
      query: { warehouse_code: params.warehouse_code, aisle_code: params.aisle_code },
    }),

  locate: (
    params: {
      warehouse_code?: string;
      aisle_code?: string;
      rack_code?: string;
      limit?: number;
    },
    opts: RequestOptions = {},
  ) => api.get<LocateResult>("/rack/locate", { ...opts, query: { ...params } }),

  resolve: (
    params: { q: string; warehouse_code?: string; aisle_code?: string },
    opts: RequestOptions = {},
  ) => api.get<ResolveResult>("/rack/resolve", { ...opts, query: { ...params } }),

  /** Place a model in a tray. */
  occupy: (slotId: string, body: { occupied_by_model: string; notes?: string }) =>
    api.post(`/rack/slots/${slotId}/occupy`, body, {
      headers: { "Idempotency-Key": crypto.randomUUID() },
    }),

  release: (slotId: string) => api.post(`/rack/slots/${slotId}/release`, {}),
};
