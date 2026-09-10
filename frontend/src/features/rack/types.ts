export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type RackStatus = "active" | "inactive";

export interface RackSlot {
  id: string;
  rack_code: string;
  row_no: number;
  column_no: number;
  shelf_no: number;
  location_name: string | null;
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
  rack_code?: string;
  occupied?: boolean;
  occupied_by_model?: string;
}
