import { api, type RequestOptions } from "@/lib/api/client";
import type { Page, RackListParams, RackSlot } from "./types";

/**
 * Talks to the Rack microservice via the gateway path `/api/v1/rack`.
 * `next.config.ts` rewrites that prefix to the service (default :8003).
 */
const base = "/rack/slots";

export const rackApi = {
  list: (params: RackListParams = {}, opts: RequestOptions = {}) =>
    api.get<Page<RackSlot>>(base, { ...opts, query: { ...params } }),
  get: (id: string, opts: RequestOptions = {}) =>
    api.get<RackSlot>(`${base}/${id}`, opts),
  create: (body: Record<string, unknown>) =>
    api.post<RackSlot>(base, body, {
      headers: { "Idempotency-Key": crypto.randomUUID() },
    }),
  update: (id: string, body: Record<string, unknown>) =>
    api.put<RackSlot>(`${base}/${id}`, body),
  remove: (id: string) => api.delete<void>(`${base}/${id}`),
  occupy: (id: string, body: Record<string, unknown>) =>
    api.post<RackSlot>(`${base}/${id}/occupy`, body),
  release: (id: string) => api.post<RackSlot>(`${base}/${id}/release`, {}),
};
