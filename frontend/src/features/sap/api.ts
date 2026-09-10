import { api, type RequestOptions } from "@/lib/api/client";
import type {
  ListRecordsParams,
  Page,
  RecordUpdate,
  SapEnums,
  SapInwardRecord,
  SyncRun,
} from "./types";

/**
 * Talks to the SAP Integration microservice via the gateway path `/api/v1/sap`.
 * `next.config.ts` rewrites that prefix to the service (default :8001).
 */
export const sapApi = {
  listRecords: (params: ListRecordsParams = {}, opts: RequestOptions = {}) =>
    api.get<Page<SapInwardRecord>>("/sap/records", { ...opts, query: { ...params } }),

  updateRecord: (id: string, patch: RecordUpdate) =>
    api.patch<SapInwardRecord>(`/sap/records/${id}`, patch),

  enums: (opts: RequestOptions = {}) => api.get<SapEnums>("/sap/enums", opts),

  syncRuns: (opts: RequestOptions = {}) => api.get<SyncRun[]>("/sap/sync-runs", opts),

  triggerSync: (count?: number) =>
    api.post<SyncRun>("/sap/sync", count ? { count } : {}, {
      headers: { "Idempotency-Key": crypto.randomUUID() },
    }),
};
