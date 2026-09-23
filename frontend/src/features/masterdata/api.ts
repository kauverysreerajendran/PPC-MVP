import { api, type RequestOptions } from "@/lib/api/client";
import type { ListParams, Page } from "./types";

/**
 * Talks to the Masterdata microservice via the gateway path `/api/v1/masterdata`.
 * `next.config.ts` rewrites that prefix to the service (default :8002).
 */
export type MdResource =
  | "models"
  | "plating-colors"
  | "vendors"
  | "locations"
  | "sap-outwards"
  | "trays"
  | "boxes";

export function masterdataApi<T>(resource: MdResource) {
  const base = `/masterdata/${resource}`;
  return {
    list: (params: ListParams = {}, opts: RequestOptions = {}) =>
      api.get<Page<T>>(base, { ...opts, query: { ...params } }),
    get: (id: string, opts: RequestOptions = {}) => api.get<T>(`${base}/${id}`, opts),
    create: (body: Record<string, unknown>) =>
      api.post<T>(base, body, { headers: { "Idempotency-Key": crypto.randomUUID() } }),
    update: (id: string, body: Record<string, unknown>) =>
      api.put<T>(`${base}/${id}`, body),
    remove: (id: string) => api.delete<void>(`${base}/${id}`),
  };
}

/**
 * Edit the transaction fields (box/tray/status) of the SAP outward row that
 * matches a SAP reference. Used by the SAP Upload screen. The service rejects
 * any box_uid / tray_id / tray_type that is not in the masters.
 *
 * A reference the SAP feed knows but masterdata has no line for yet is created
 * from the SAP identifiers sent alongside the edit (see `outwardSeedFrom`).
 */
export const patchOutwardByRef = (
  sapReferenceId: string,
  body: Record<string, unknown>,
) => api.patch(`/masterdata/sap-outwards/by-ref/${encodeURIComponent(sapReferenceId)}`, body);

/** The outward-status lookup (code → label, dispatched flag), ordered by sort_order. */
export const outwardStatusMasterApi = (opts: RequestOptions = {}) =>
  api.get<import("./types").OutwardStatusDef[]>("/masterdata/outward-status-master", opts);

/** The SAP movement-type lookup (code → description), ordered by sort_order. */
export const movementTypeMasterApi = (opts: RequestOptions = {}) =>
  api.get<import("./types").MovementTypeDef[]>("/masterdata/movement-type-master", opts);

export const locationChildrenApi = (parentId: string | null, opts: RequestOptions = {}) =>
  api.get<import("./types").MdLocation[]>("/masterdata/locations/children", {
    ...opts,
    query: parentId ? { parent_location_id: parentId } : {},
  });
