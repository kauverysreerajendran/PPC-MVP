import { api, type RequestOptions } from "@/lib/api/client";
import type { Page } from "@/features/masterdata/types";
import type {
  SapInwardScan,
  SapInwardScanBody,
  SapInwardScanResult,
  SapOutward,
} from "@/features/masterdata/types";
import type { LineStatus } from "@/features/status/types";
import type { InwardDocument } from "./documents";

const base = "/masterdata/sap-inward";

export const sapInwardApi = {
  /** Only the outward lines a Box UID has been scanned against so far. */
  lines: (
    params: { page?: number; page_size?: number; search?: string; inward_status?: string } = {},
    opts: RequestOptions = {},
  ) => api.get<Page<SapOutward>>(`${base}/lines`, { ...opts, query: { ...params } }),

  /** The active outward line carrying this Box UID, or null. Records nothing. */
  lookup: async (box_uid: string) => {
    const page = await api.get<Page<SapOutward>>("/masterdata/sap-outwards", {
      query: { box_uid, status: "active", page_size: 1, with_total: false },
    });
    return page.items[0] ?? null;
  },

  /**
   * Register one received front+back piece against the line carrying this box —
   * or, with `accepted_qty`, the accepted / QED-rejected quantities for the line.
   */
  scan: (body: SapInwardScanBody) =>
    api.post<SapInwardScanResult>(`${base}/scan`, body, {
      headers: { "Idempotency-Key": crypto.randomUUID() },
    }),

  /** Finalise receiving for a line: RECEIVED if complete, else SHORT. */
  close: (outwardId: string) =>
    api.post<SapOutward>(`${base}/${outwardId}/close`, {}),

  /** Wipe the receiving tally + scans for a line. */
  reset: (outwardId: string) =>
    api.post<SapOutward>(`${base}/${outwardId}/reset`, {}),

  scans: (outwardId: string) =>
    api.get<SapInwardScan[]>(`${base}/${outwardId}/scans`),

  /**
   * Confirm the received quantities and the four inward receipts:
   * inward status → Verified (Status service).
   */
  verify: (outwardId: string, documents_checked: InwardDocument[]) =>
    api.post<LineStatus>(`${base}/${outwardId}/verify`, { documents_checked }),
};
