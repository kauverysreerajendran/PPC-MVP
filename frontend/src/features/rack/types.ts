export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type RackStatus = "active" | "inactive";
export type SlotState = "empty" | "occupied" | "reserved" | "blocked";

export interface RackSlot {
  id: string;
  warehouse_code: string;
  aisle_code: string;
  rack_code: string;
  shelf_no: number;
  row_no: number;
  tray_no: number;
  /** canonical location code, e.g. K-S4-R2-T05 */
  code: string;
  location_name: string | null;
  slot_state: SlotState;
  occupied: boolean;
  occupied_by_model: string | null;
  date_of_occupied: string | null;
  notes: string | null;
  status: RackStatus;
  created_at: string;
  updated_at: string;
}

export interface RackListParams {
  page?: number;
  page_size?: number;
  search?: string;
  sort?: string;
  direction?: "asc" | "desc";
  status?: RackStatus;
  warehouse_code?: string;
  aisle_code?: string;
  rack_code?: string;
  slot_state?: SlotState;
  occupied?: boolean;
  occupied_by_model?: string;
}
