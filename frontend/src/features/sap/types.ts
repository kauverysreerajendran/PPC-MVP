export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface SapInwardRecord {
  id: string;
  sap_reference_id: string;
  transaction_date: string;
  dc_no: string | null;
  po_no: string | null;
  material_no: string | null;
  model_no: string | null;
  material_description: string | null;
  vendor_code: string | null;
  vendor_name: string | null;
  batch_no: string | null;
  lot_no: string | null;
  quantity: string | null;
  movement_type: string | null;
  remark: string | null;
  source_system: string;
  sync_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ColumnDef {
  key: string;
  header: string;
  editable: boolean;
  type: "text" | "number" | "date";
}

export interface SapEnums {
  movement_types: string[];
  columns: ColumnDef[];
}

export interface SyncRun {
  id: string;
  source_system: string;
  provider: string;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  records_ingested: number;
  error: string | null;
  triggered_by: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface ListRecordsParams {
  page?: number;
  page_size?: number;
  search?: string;
  /** comma-separated sap_reference_ids matched elsewhere (Box UID in masterdata), OR'ed with search */
  refs?: string;
  /** split by a status held in the Status service (all three together) */
  status_stage?: "outward" | "inward" | "rack";
  status_code?: string;
  status_match?: "include" | "exclude";
  sort?: string;
  direction?: "asc" | "desc";
}

export interface RecordUpdate {
  remark?: string;
}
