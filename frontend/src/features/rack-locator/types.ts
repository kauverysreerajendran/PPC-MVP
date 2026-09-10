/**
 * Mirrors the Rack service contract (`services/rack/app/schemas.py`).
 *
 * Every shape here is *rendered*, never computed: shelf / row / tray counts,
 * occupancy totals, percentages and the Locate Me ranking all arrive from the
 * backend, which derives them from the `rack_master` topology table.
 */

export type SlotState = "empty" | "occupied" | "reserved" | "blocked";
export type RackState = "empty" | "available" | "filling" | "nearly_full" | "full";

export interface Occupancy {
  capacity: number;
  occupied: number;
  empty: number;
  reserved: number;
  blocked: number;
  occupancy_pct: number;
  availability_pct: number;
}

export interface ShelfSummary {
  shelf_no: number;
  label: string;
  occupancy: Occupancy;
}

export interface RackSummary {
  id: string;
  warehouse_code: string;
  aisle_code: string;
  rack_code: string;
  rack_name: string | null;
  position: number;
  side: string | null;
  shelf_count: number;
  row_count: number;
  tray_count: number;
  occupancy: Occupancy;
  state: RackState;
  shelves: ShelfSummary[];
}

export interface AisleSummary {
  aisle_code: string;
  aisle_name: string | null;
  rack_count: number;
  occupancy: Occupancy;
  racks: RackSummary[];
}

export interface WarehouseSummary {
  warehouse_code: string;
  warehouse_name: string | null;
  aisle_count: number;
  rack_count: number;
  occupancy: Occupancy;
  aisles: AisleSummary[];
}

export interface Topology {
  generated_at: string;
  occupancy: Occupancy;
  warehouses: WarehouseSummary[];
}

export interface Tray {
  id: string | null;
  tray_no: number;
  code: string;
  state: SlotState;
  occupied_by_model: string | null;
  date_of_occupied: string | null;
  location_name: string | null;
  notes: string | null;
}

export interface ShelfRowData {
  row_no: number;
  label: string;
  occupancy: Occupancy;
  trays: Tray[];
}

export interface Shelf {
  shelf_no: number;
  label: string;
  occupancy: Occupancy;
  rows: ShelfRowData[];
}

export interface RackDetail {
  id: string;
  warehouse_code: string;
  warehouse_name: string | null;
  aisle_code: string;
  aisle_name: string | null;
  rack_code: string;
  rack_name: string | null;
  position: number;
  side: string | null;
  shelf_count: number;
  row_count: number;
  tray_count: number;
  occupancy: Occupancy;
  state: RackState;
  generated_at: string;
  /** top shelf first — the order a picker reads the rack */
  shelves: Shelf[];
}

export interface Recommendation {
  rank: number;
  score: number;
  distance_m: number;
  id: string;
  code: string;
  warehouse_code: string;
  aisle_code: string;
  rack_code: string;
  shelf_no: number;
  row_no: number;
  tray_no: number;
  location_name: string | null;
  reason: string;
}

export interface LocateResult {
  generated_at: string;
  warehouse_code: string | null;
  aisle_code: string | null;
  rack_code: string | null;
  total_empty: number;
  recommendations: Recommendation[];
}

export interface ResolveResult {
  query: string;
  matched: boolean;
  slot: {
    id: string;
    warehouse_code: string;
    aisle_code: string;
    rack_code: string;
    shelf_no: number;
    row_no: number;
    tray_no: number;
    code: string;
    location_name: string | null;
    slot_state: SlotState;
    occupied: boolean;
    occupied_by_model: string | null;
  } | null;
}

/** A tray the user has pointed at, wherever they pointed at it from. */
export interface SelectedLocation {
  warehouse_code: string;
  aisle_code: string;
  rack_code: string;
  shelf_no: number;
  row_no: number;
  tray_no: number;
  code: string;
  id: string | null;
  state: SlotState;
}
