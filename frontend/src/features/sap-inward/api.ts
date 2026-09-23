import { api, type RequestOptions } from "@/lib/api/client";
import { patchOutwardByRef } from "@/features/masterdata/api";
import { sapApi } from "@/features/sap/api";
import type { Page } from "@/features/masterdata/types";
import type {
  SapInwardScan,
  SapInwardScanBody,
  SapInwardScanResult,
  SapOutward,
} from "@/features/masterdata/types";
import type { SapInwardRecord } from "@/features/sap/types";
import type { LineStatus } from "@/features/status/types";
import type { InwardDocument } from "./documents";

const base = "/masterdata/sap-inward";

export type InwardLinesParams = {
  page?: number;
  page_size?: number;
  search?: string;
  inward_status?: string;
  /** which half to return — "pending" = dispatched, not yet in a rack (SAP
   * Inward's Main Table asks only for its `started` subset; the rest of Main
   * is what was scanned), "received" = Complete Table (placed); omitted means
   * "received" */
  stage?: "pending" | "received";
  /** with `stage: "pending"`: only lines whose rack placement has been started
   * and not finished (IN_PROGRESS / DRAFT / PARTIALLY_PLACED) */
  started?: boolean;
};

export const sapInwardApi = {
  /**
   * The outward lines SAP Inward works on. `stage: "pending"` is every
   * dispatched line not yet in a rack, whether or not receiving has been
   * recorded or verified — the Main Table itself is scan-driven and reads only
   * the `started: true` subset of it. `"received"` — the default on the service, so an
   * omitted `stage` still means this — is the Complete Table: lines whose
   * received pieces are all placed (the Status service's `rack`/`PLACED` set).
   */
  lines: (
    params: InwardLinesParams = {},
    opts: RequestOptions = {},
  ) => api.get<Page<SapOutward>>(`${base}/lines`, { ...opts, query: { ...params } }),

  /**
   * Every outward line on this DC / PO, as masterdata holds it.
   *
   * The SAP feed is the full picture of a document — it carries every line SAP
   * sent, including ones masterdata has never seen. SAP Inward works on
   * masterdata lines, so each feed line goes through `by-ref` first, which
   * creates the row from the SAP identifiers when there is none. That is the
   * same lazy creation a dispatch used to perform on SAP Outward.
   *
   * Masterdata is then read back by the same document number, so the result
   * also carries what the feed does not know about — a shortage back-order
   * raised against this DC, for one.
   *
   * Neither service has a `dc_no` / `po_no` filter, so the value goes through
   * the text search and the field is matched exactly afterwards — the shape the
   * Scan page uses (`features/scan/resolve.ts`).
   */
  lookupDocument: async (field: "dc_no" | "po_no", value: string) => {
    const wanted = value.toUpperCase();
    const same = (v: string | null | undefined) => (v ?? "").toUpperCase() === wanted;

    // 1. What SAP says is on the document.
    let onDoc: SapInwardRecord[] = [];
    try {
      const feed = await sapApi.listRecords({ search: value, page_size: 200 });
      onDoc = feed.items.filter((r) => same(r[field]));
    } catch {
      // Feed unreachable — carry on with whatever masterdata already holds.
    }

    // 2. Make sure masterdata has a line for each. One it already has is left
    //    exactly as it is: the body carries SAP identifiers only, no box, tray
    //    or receiving field.
    await Promise.all(
      onDoc.map((r) =>
        patchOutwardByRef(r.sap_reference_id, {
          transaction_date: r.transaction_date,
          sap_document_no: r.dc_no ?? null,
          dc_no: r.dc_no ?? null,
          po_no: r.po_no ?? null,
          material_no: r.material_no ?? null,
          model_no: r.model_no ?? null,
          // Without this the created line has no vendor and the grid's Vendor
          // cell reads "—". The service checks the code against the vendor
          // master, and the feed only ever carries codes that are in it.
          vendor_code: r.vendor_code ?? null,
          batch_no: r.batch_no ?? null,
          lot_no: r.lot_no ?? null,
          quantity: r.quantity ?? null,
          movement_type: r.movement_type ?? null,
        }).catch(() => undefined),
      ),
    );

    // 3. Read the document back from masterdata.
    const page = await api.get<Page<SapOutward>>("/masterdata/sap-outwards", {
      query: { search: value, status: "active", page_size: 200, with_total: false },
    });
    return page.items.filter((o) => same(o[field]));
  },

  /** The active outward line carrying this Box UID, or null. Records nothing. */
  lookup: async (box_uid: string) => {
    const page = await api.get<Page<SapOutward>>("/masterdata/sap-outwards", {
      query: { box_uid, status: "active", page_size: 1, with_total: false },
    });
    return page.items[0] ?? null;
  },

  /**
   * The current state of exactly these lines (by `sap_reference_id`) — how
   * the rows scanned at SAP Inward stay live without a worklist.
   */
  byRefs: (refs: string[], opts: RequestOptions = {}) =>
    api.get<Page<SapOutward>>("/masterdata/sap-outwards", {
      ...opts,
      query: {
        refs: refs.slice(0, 200).join(","),
        status: "active",
        page_size: 200,
        with_total: false,
      },
    }),

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
