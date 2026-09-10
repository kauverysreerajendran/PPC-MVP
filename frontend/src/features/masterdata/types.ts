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
  model_id: string | null;
  vendor_id: string | null;
  plating_color_id: string | null;
  location_id: string | null;
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
}

export type MdRecord =
  | MasterModel
  | PlatingColor
  | Vendor
  | MdLocation
  | SapOutward
  | Tray
  | Box;
