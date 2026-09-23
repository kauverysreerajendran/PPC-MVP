export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type MdStatus = "active" | "inactive";

export interface AuditFields {
  id: string;
  status: MdStatus;
  created_at: string;
  updated_at: string;
}

export interface MasterModel extends AuditFields {
  model_no: string;
  model_name: string | null;
  part: string | null;
  description: string | null;
  uom: string | null;
}

export interface PlatingColor extends AuditFields {
  color_code: string;
  color_name: string;
  description: string | null;
}

export interface Vendor extends AuditFields {
  vendor_code: string;
  vendor_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  description: string | null;
}

export type LocationType = "WAREHOUSE" | "RACK" | "ROW" | "SHELF" | "BIN";

export interface MdLocation extends AuditFields {
  location_code: string;
  location_name: string | null;
  location_type: LocationType;
  parent_location_id: string | null;
}

export interface SapOutward extends AuditFields {
  sap_reference_id: string;
  sap_document_no: string | null;
  transaction_date: string;
  dc_no: string | null;
  po_no: string | null;
  material_no: string | null;
  model_no: string | null;
  vendor_code: string | null;
  box_uid: string | null;
  tray_id: string | null;
  tray_type: string | null;
  no_of_trays: number | null;
  front_case_trays: number | null;
  back_case_trays: number | null;
  outward_status: string | null;
  batch_no: string | null;
  lot_no: string | null;
  quantity: number | string | null;
  movement_type: string | null;
  source_system: string;
  /**
   * Provenance. A shortage back-order — the new line SAP Inward raises for the
   * balance a receiving entry did not account for — carries `origin`
   * `"SHORTAGE"` and the reference of the line it came from; a line from the
   * SAP feed carries `"SAP"` (or null, for rows written before revision 0023).
   */
  parent_sap_reference_id: string | null;
  origin: string | null;
  /**
   * The parent line's figures frozen when this shortage back-order was raised
   * (masterdata revision 0024), so the quantity trail — lot, accepted, QED
   * rejected, received, and this line's own qty as the pending shortage — can
   * be shown without fetching the parent. Null on every other line.
   */
  shortage_parent_lot_qty?: number | string | null;
  shortage_parent_accepted_qty?: number | string | null;
  shortage_parent_rejected_qty?: number | string | null;
  shortage_parent_received_qty?: number | string | null;
  model_id: string | null;
  vendor_id: string | null;
  plating_color_id: string | null;
  location_id: string | null;

  // --- SAP inward (receiving) ---
  received_pieces: number;
  received_qty: number | string | null;
  inward_status: string | null;
  inward_last_scan_at: string | null;
  /** computed server-side (front+back attached = one piece) */
  expected_pieces: number;
  /** whole parts in a regular piece; the first `extra_qty_pieces` pieces carry one more */
  qty_per_piece: number | null;
  extra_qty_pieces: number;
  shortage_pieces: number;
  /** lot − received − QED rejected */
  shortage_qty: number | string | null;
  /** QED-rejected qty entered on SAP Inward (0 when none) */
  rejected_qty: number;
}

/** POST /sap-inward/scan — with `accepted_qty` it records the entered quantities instead of one piece. */
export interface SapInwardScanBody {
  box_uid: string;
  po_no?: string;
  dc_no?: string;
  accepted_qty?: number;
  rejected_qty?: number;
}

export interface SapInwardScan {
  id: string;
  sap_outward_id: string;
  box_uid: string | null;
  po_no: string | null;
  dc_no: string | null;
  piece_no: number;
  qty: number | string | null;
  scanned_by: string | null;
  scanned_at: string;
}

export interface SapInwardScanResult {
  matched: boolean;
  message: string;
  scan: SapInwardScan | null;
  outward: SapOutward | null;
}

export interface Box extends AuditFields {
  box_uid: string;
  box_type: string | null;
}

export interface OutwardStatusDef extends AuditFields {
  code: string;
  label: string;
  sort_order: number;
  is_default: boolean;
  is_dispatched: boolean;
}

export interface MovementTypeDef extends AuditFields {
  code: string;
  description: string;
  sort_order: number;
}

export interface Tray extends AuditFields {
  tray_id: string;
  box_id: string | null;
  tray_type: string | null;
  no_of_trays: number;
  qty: number | string | null;
  qty_capacity: number | string | null;
}

export interface ListParams {
  page?: number;
  page_size?: number;
  search?: string;
  sort?: string;
  direction?: "asc" | "desc";
  status?: MdStatus;
  /** comma-separated sap_reference_ids — only those lines (sap-outwards only) */
  refs?: string;
  /** provenance filter — "SHORTAGE" for back-orders, "SAP" for feed lines (sap-outwards only) */
  origin?: string;
}

export type MdRecord =
  | MasterModel
  | PlatingColor
  | Vendor
  | MdLocation
  | SapOutward
  | Tray
  | Box;
