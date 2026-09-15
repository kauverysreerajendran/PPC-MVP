"""Request / response models. These are the service's published contract."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

T = TypeVar("T")

Status = Literal["active", "inactive"]
SlotState = Literal["empty", "occupied", "reserved", "blocked"]
#: coarse fill label a rack is given, derived server-side from its occupancy
RackState = Literal["empty", "available", "filling", "nearly_full", "full"]

Code = Annotated[
    str, StringConstraints(min_length=1, max_length=32, strip_whitespace=True)
]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- rack master (physical topology) ---------------------------------------
class RackMasterBase(BaseModel):
    warehouse_code: Code
    warehouse_name: str | None = Field(default=None, max_length=64)
    aisle_code: Code
    aisle_name: str | None = Field(default=None, max_length=64)
    rack_code: Code
    rack_name: str | None = Field(default=None, max_length=64)
    position: int = Field(default=1, ge=1)
    side: str | None = Field(default=None, max_length=8)
    shelf_count: int = Field(ge=1, le=40)
    row_count: int = Field(ge=1, le=40)
    tray_count: int = Field(ge=1, le=100)
    notes: str | None = None


class RackMasterCreate(RackMasterBase):
    status: Status = "active"


class RackMasterUpdate(BaseModel):
    warehouse_code: str | None = Field(default=None, min_length=1, max_length=32)
    warehouse_name: str | None = Field(default=None, max_length=64)
    aisle_code: str | None = Field(default=None, min_length=1, max_length=32)
    aisle_name: str | None = Field(default=None, max_length=64)
    rack_code: str | None = Field(default=None, min_length=1, max_length=32)
    rack_name: str | None = Field(default=None, max_length=64)
    position: int | None = Field(default=None, ge=1)
    side: str | None = Field(default=None, max_length=8)
    shelf_count: int | None = Field(default=None, ge=1, le=40)
    row_count: int | None = Field(default=None, ge=1, le=40)
    tray_count: int | None = Field(default=None, ge=1, le=100)
    notes: str | None = None
    status: Status | None = None


class RackMasterOut(ORMModel):
    id: uuid.UUID
    warehouse_code: str
    warehouse_name: str | None
    aisle_code: str
    aisle_name: str | None
    rack_code: str
    rack_name: str | None
    position: int
    side: str | None
    shelf_count: int
    row_count: int
    tray_count: int
    capacity: int
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class MaterializeOut(BaseModel):
    """Result of deriving tray slots from a rack master row."""

    rack_code: str
    warehouse_code: str
    aisle_code: str
    capacity: int
    created: int
    deactivated: int
    reactivated: int


# --- rack slots ------------------------------------------------------------
class RackBase(BaseModel):
    warehouse_code: Code
    aisle_code: Code
    rack_code: Code
    shelf_no: int = Field(ge=1)
    row_no: int = Field(ge=1)
    tray_no: int = Field(ge=1)
    location_name: str | None = Field(default=None, max_length=64)
    slot_state: SlotState = "empty"
    occupied: bool = False
    occupied_by_model: str | None = Field(default=None, max_length=64)
    date_of_occupied: datetime | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _occupancy_consistent(self) -> RackBase:
        if self.occupied and not self.occupied_by_model:
            raise ValueError("occupied_by_model is required when occupied is true")
        if self.occupied and self.slot_state != "occupied":
            self.slot_state = "occupied"
        if not self.occupied and self.slot_state == "occupied":
            raise ValueError("slot_state 'occupied' requires occupied = true")
        return self


class RackCreate(RackBase):
    status: Status = "active"


class RackUpdate(BaseModel):
    warehouse_code: str | None = Field(default=None, min_length=1, max_length=32)
    aisle_code: str | None = Field(default=None, min_length=1, max_length=32)
    rack_code: str | None = Field(default=None, min_length=1, max_length=32)
    shelf_no: int | None = Field(default=None, ge=1)
    row_no: int | None = Field(default=None, ge=1)
    tray_no: int | None = Field(default=None, ge=1)
    location_name: str | None = Field(default=None, max_length=64)
    occupied: bool | None = None
    occupied_by_model: str | None = Field(default=None, max_length=64)
    date_of_occupied: datetime | None = None
    notes: str | None = None
    status: Status | None = None


class RackOccupy(BaseModel):
    """Dynamically mark a slot occupied by a model."""

    occupied_by_model: Code
    date_of_occupied: datetime | None = None  # defaults to now() server-side
    notes: str | None = None


class PlacePiece(BaseModel):
    """One received piece going into one tray."""

    slot_id: uuid.UUID
    #: whole parts carried by this piece
    qty: Decimal | None = Field(default=None, ge=0)


class RackPlaceIn(BaseModel):
    """Store received pieces of one SAP line into the trays the operator confirmed."""

    sap_reference_id: str = Field(min_length=1, max_length=64)
    model_no: Code
    lot_no: str | None = Field(default=None, max_length=64)
    #: pieces received so far — decides Partially placed vs Placed
    received_pieces: int = Field(ge=1)
    pieces: list[PlacePiece] = Field(min_length=1, max_length=200)


class RackSlotState(BaseModel):
    """Flag a free slot as reserved / blocked, or return it to empty."""

    slot_state: Literal["empty", "reserved", "blocked"]
    notes: str | None = None


class RackOut(ORMModel):
    id: uuid.UUID
    warehouse_code: str
    aisle_code: str
    rack_code: str
    shelf_no: int
    row_no: int
    tray_no: int
    code: str
    location_name: str | None
    slot_state: str
    occupied: bool
    occupied_by_model: str | None
    date_of_occupied: datetime | None
    qty: Decimal | None = None
    lot_no: str | None = None
    sap_reference_id: str | None = None
    placement_source: str | None = None
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime


# --- occupancy roll-ups ----------------------------------------------------
class Occupancy(BaseModel):
    """Counts every level of the hierarchy reports the same way."""

    capacity: int = 0
    occupied: int = 0
    empty: int = 0
    reserved: int = 0
    blocked: int = 0
    occupancy_pct: float = 0.0
    availability_pct: float = 0.0


class ShelfSummary(BaseModel):
    shelf_no: int
    label: str
    occupancy: Occupancy


class RackSummary(BaseModel):
    id: uuid.UUID
    warehouse_code: str
    aisle_code: str
    rack_code: str
    rack_name: str | None
    position: int
    side: str | None
    shelf_count: int
    row_count: int
    tray_count: int
    occupancy: Occupancy
    state: RackState
    shelves: list[ShelfSummary]


class AisleSummary(BaseModel):
    aisle_code: str
    aisle_name: str | None
    rack_count: int
    occupancy: Occupancy
    racks: list[RackSummary]


class WarehouseSummary(BaseModel):
    warehouse_code: str
    warehouse_name: str | None
    aisle_count: int
    rack_count: int
    occupancy: Occupancy
    aisles: list[AisleSummary]


class TopologyOut(BaseModel):
    """The whole physical structure, derived from rack_master + live occupancy."""

    generated_at: datetime
    occupancy: Occupancy
    warehouses: list[WarehouseSummary]


# --- rack detail (the drill-down the visualisation renders) -----------------
class TrayOut(BaseModel):
    id: uuid.UUID | None
    tray_no: int
    code: str
    state: SlotState
    occupied_by_model: str | None = None
    date_of_occupied: datetime | None = None
    qty: Decimal | None = None
    lot_no: str | None = None
    sap_reference_id: str | None = None
    location_name: str | None = None
    notes: str | None = None


class RowOut(BaseModel):
    row_no: int
    label: str
    occupancy: Occupancy
    trays: list[TrayOut]


class ShelfOut(BaseModel):
    shelf_no: int
    label: str
    occupancy: Occupancy
    rows: list[RowOut]


class RackDetailOut(BaseModel):
    id: uuid.UUID
    warehouse_code: str
    warehouse_name: str | None
    aisle_code: str
    aisle_name: str | None
    rack_code: str
    rack_name: str | None
    position: int
    side: str | None
    shelf_count: int
    row_count: int
    tray_count: int
    occupancy: Occupancy
    state: RackState
    generated_at: datetime
    #: shelves top-first (highest shelf_no first), the way the rack is read
    shelves: list[ShelfOut]


# --- locate me -------------------------------------------------------------
class Recommendation(BaseModel):
    rank: int
    score: float
    distance_m: float
    id: uuid.UUID
    code: str
    warehouse_code: str
    aisle_code: str
    rack_code: str
    shelf_no: int
    row_no: int
    tray_no: int
    location_name: str | None
    reason: str


class LocateOut(BaseModel):
    generated_at: datetime
    warehouse_code: str | None
    aisle_code: str | None
    rack_code: str | None
    total_empty: int
    recommendations: list[Recommendation]


class ResolveOut(BaseModel):
    """A parsed + resolved search term such as ``K-S4-R2-T05``."""

    query: str
    matched: bool
    slot: RackOut | None = None


# --- find every tray a model / lot occupies -------------------------------
class Placement(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id: uuid.UUID
    code: str
    warehouse_code: str
    aisle_code: str
    rack_code: str
    shelf_no: int
    row_no: int
    tray_no: int
    occupied_by_model: str | None
    qty: Decimal | None
    lot_no: str | None
    sap_reference_id: str | None
    date_of_occupied: datetime | None


class FindOut(BaseModel):
    query: str
    field: Literal["model_no", "lot_no", "sap_reference_id"]
    count: int
    total_qty: Decimal | None
    placements: list[Placement]


# --- SAP outward allocation ----------------------------------------------
class AllocateIn(BaseModel):
    warehouse_code: str | None = None
    aisle_code: str | None = None
    #: free every tray a previous allocation filled, then re-place from scratch
    reset: bool = False
    #: compute the plan and report it without writing anything
    dry_run: bool = False
    #: fix the RNG so the same feed places into the same trays every run
    seed: int | None = None


class AllocationLine(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    sap_reference_id: str | None
    lot_no: str | None
    model_no: str
    trays_requested: int
    trays_placed: int
    status: Literal["placed", "partial", "already-placed"]
    locations: list[str]


class AllocateOut(BaseModel):
    generated_at: datetime
    dry_run: bool
    reset: bool
    trays_freed: int
    lines_seen: int
    lines_placed: int
    lines_partial: int
    lines_skipped: int
    trays_placed: int
    empty_trays_left: int
    lines: list[AllocationLine]


class RackPlacedOut(BaseModel):
    sap_reference_id: str
    #: received pieces of this line already in trays
    placed: int
    slots: list[RackOut]


class RackPlaceOut(BaseModel):
    sap_reference_id: str
    placed_now: int
    #: received pieces of this line now in racks, including earlier placements
    placed_total: int
    received_pieces: int
    #: the rack status reported to the Status service
    rack_status: Literal["PARTIALLY_PLACED", "PLACED"]
    slots: list[RackOut]


class HealthOut(BaseModel):
    status: str
    service: str
    database: str
