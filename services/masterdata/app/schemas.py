"""Request / response models. These are the service's published contract."""

from __future__ import annotations

import math
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    computed_field,
    field_serializer,
    field_validator,
    model_validator,
)

T = TypeVar("T")


def _clean_number(v: Decimal | None) -> int | float | None:
    """467.000 -> 467, 467.5 -> 467.5 — never render trailing zeros."""
    if v is None:
        return None
    if v == v.to_integral_value():
        return int(v)
    return float(v)

Status = Literal["active", "inactive"]
LocationType = Literal["WAREHOUSE", "RACK", "ROW", "SHELF", "BIN"]
OutwardStatus = Literal["NEW", "ALLOCATED", "PACKED", "DISPATCHED", "HOLD"]

Str1 = Annotated[str, StringConstraints(min_length=1, max_length=255, strip_whitespace=True)]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())


# --- master models -----------------------------------------------------------
class MasterModelBase(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    model_no: Str1
    model_name: str | None = Field(default=None, max_length=255)
    part: str | None = Field(default=None, max_length=64)
    description: str | None = None
    uom: str | None = Field(default=None, max_length=16)


class MasterModelCreate(MasterModelBase):
    status: Status = "active"


class MasterModelUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    model_no: str | None = Field(default=None, min_length=1, max_length=64)
    model_name: str | None = Field(default=None, max_length=255)
    part: str | None = Field(default=None, max_length=64)
    description: str | None = None
    uom: str | None = Field(default=None, max_length=16)
    status: Status | None = None


class MasterModelOut(ORMModel):
    id: uuid.UUID
    model_no: str
    model_name: str | None
    part: str | None
    description: str | None
    uom: str | None
    status: str
    created_at: datetime
    updated_at: datetime


# --- plating colors ---------------------------------------------------------
class PlatingColorCreate(BaseModel):
    color_code: Str1
    color_name: Str1
    description: str | None = None
    status: Status = "active"


class PlatingColorUpdate(BaseModel):
    color_code: str | None = Field(default=None, min_length=1, max_length=32)
    color_name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None
    status: Status | None = None


class PlatingColorOut(ORMModel):
    id: uuid.UUID
    color_code: str
    color_name: str
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime


# --- vendors --------------------------------------------------------------
class VendorCreate(BaseModel):
    vendor_code: Str1
    vendor_name: Str1
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=32)
    description: str | None = None
    status: Status = "active"


class VendorUpdate(BaseModel):
    vendor_code: str | None = Field(default=None, min_length=1, max_length=32)
    vendor_name: str | None = Field(default=None, min_length=1, max_length=255)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=32)
    description: str | None = None
    status: Status | None = None


class VendorOut(ORMModel):
    id: uuid.UUID
    vendor_code: str
    vendor_name: str
    contact_email: str | None
    contact_phone: str | None
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime


# --- locations -----------------------------------------------------------
class LocationCreate(BaseModel):
    location_code: Str1
    location_name: str | None = Field(default=None, max_length=255)
    location_type: LocationType
    parent_location_id: uuid.UUID | None = None
    status: Status = "active"


class LocationUpdate(BaseModel):
    location_code: str | None = Field(default=None, min_length=1, max_length=64)
    location_name: str | None = Field(default=None, max_length=255)
    location_type: LocationType | None = None
    parent_location_id: uuid.UUID | None = None
    status: Status | None = None


class LocationOut(ORMModel):
    id: uuid.UUID
    location_code: str
    location_name: str | None
    location_type: str
    parent_location_id: uuid.UUID | None
    status: str
    created_at: datetime
    updated_at: datetime


# --- sap outwards ------------------------------------------------------
class SapOutwardBase(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    sap_reference_id: Str1
    sap_document_no: str | None = Field(default=None, max_length=64)
    transaction_date: datetime
    dc_no: str | None = Field(default=None, max_length=64)
    po_no: str | None = Field(default=None, max_length=64)
    material_no: str | None = Field(default=None, max_length=64)
    model_no: str | None = Field(default=None, max_length=64)
    vendor_code: str | None = Field(default=None, max_length=32)
    batch_no: str | None = Field(default=None, max_length=64)
    lot_no: str | None = Field(default=None, max_length=64)
    quantity: Decimal | None = Field(default=None, ge=0)
    movement_type: str | None = Field(default=None, max_length=16)
    source_system: str = Field(default="SAP-ECC", max_length=64)
    box_uid: str | None = Field(default=None, max_length=128)
    tray_id: str | None = Field(default=None, max_length=64)
    tray_type: str | None = Field(default=None, max_length=32)
    no_of_trays: int | None = Field(default=None, ge=1)
    front_case_trays: int | None = Field(default=None, ge=0)
    back_case_trays: int | None = Field(default=None, ge=0)
    outward_status: OutwardStatus | None = None
    model_id: uuid.UUID | None = None
    vendor_id: uuid.UUID | None = None
    plating_color_id: uuid.UUID | None = None
    location_id: uuid.UUID | None = None


class SapOutwardCreate(SapOutwardBase):
    status: Status = "active"


class SapOutwardUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    sap_document_no: str | None = Field(default=None, max_length=64)
    transaction_date: datetime | None = None
    dc_no: str | None = Field(default=None, max_length=64)
    po_no: str | None = Field(default=None, max_length=64)
    material_no: str | None = Field(default=None, max_length=64)
    model_no: str | None = Field(default=None, max_length=64)
    vendor_code: str | None = Field(default=None, max_length=32)
    batch_no: str | None = Field(default=None, max_length=64)
    lot_no: str | None = Field(default=None, max_length=64)
    quantity: Decimal | None = Field(default=None, ge=0)
    movement_type: str | None = Field(default=None, max_length=16)
    box_uid: str | None = Field(default=None, max_length=128)
    tray_id: str | None = Field(default=None, max_length=64)
    tray_type: str | None = Field(default=None, max_length=32)
    no_of_trays: int | None = Field(default=None, ge=1)
    front_case_trays: int | None = Field(default=None, ge=0)
    back_case_trays: int | None = Field(default=None, ge=0)
    outward_status: OutwardStatus | None = None
    model_id: uuid.UUID | None = None
    vendor_id: uuid.UUID | None = None
    plating_color_id: uuid.UUID | None = None
    location_id: uuid.UUID | None = None
    status: Status | None = None


class SapOutwardTxnPatch(BaseModel):
    """The transaction fields editable from the SAP Upload screen. Every value
    given for vendor_code / box_uid / tray_id / tray_type must already exist in
    the masters."""

    vendor_code: str | None = Field(default=None, max_length=32)
    box_uid: str | None = Field(default=None, max_length=128)
    tray_id: str | None = Field(default=None, max_length=64)
    tray_type: str | None = Field(default=None, max_length=32)
    no_of_trays: int | None = Field(default=None, ge=1)
    front_case_trays: int | None = Field(default=None, ge=0)
    back_case_trays: int | None = Field(default=None, ge=0)
    outward_status: OutwardStatus | None = None


class SapOutwardOut(ORMModel):
    id: uuid.UUID
    sap_reference_id: str
    sap_document_no: str | None
    transaction_date: datetime
    dc_no: str | None
    po_no: str | None
    material_no: str | None
    model_no: str | None
    vendor_code: str | None
    batch_no: str | None
    lot_no: str | None
    quantity: Decimal | None
    movement_type: str | None
    source_system: str
    box_uid: str | None
    tray_id: str | None
    tray_type: str | None
    no_of_trays: int | None
    front_case_trays: int | None
    back_case_trays: int | None
    outward_status: str | None
    model_id: uuid.UUID | None
    vendor_id: uuid.UUID | None
    plating_color_id: uuid.UUID | None
    location_id: uuid.UUID | None
    status: str
    created_at: datetime
    updated_at: datetime

    # --- SAP inward (receiving) ---
    received_pieces: int = 0
    received_qty: Decimal | None = None
    inward_status: str | None = None
    inward_last_scan_at: datetime | None = None
    #: receiving entries — read by the computed quantities below, never serialised
    #: (the scan list has its own endpoint)
    inward_scans: list[dict] | None = Field(default=None, exclude=True)

    @field_serializer("quantity", "received_qty")
    def _ser_quantity(self, v: Decimal | None) -> int | float | None:
        return _clean_number(v)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def expected_pieces(self) -> int:
        """Front + back come back attached as one piece, so the expected piece
        count is the front-case count (== back-case). Falls back through
        no_of_trays/2 then 1."""
        for n in (self.front_case_trays, self.back_case_trays):
            if n and n > 0:
                return int(n)
        if self.no_of_trays and self.no_of_trays > 0:
            return max(1, (int(self.no_of_trays) + 1) // 2)
        return 1

    @computed_field  # type: ignore[prop-decorator]
    @property
    def qty_per_piece(self) -> int | None:
        """Whole parts in a regular piece (see :func:`split_lot`)."""
        split = split_lot(self.quantity, self.expected_pieces)
        return split[0] if split else None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def extra_qty_pieces(self) -> int:
        """How many of the first pieces carry one extra part (see :func:`split_lot`)."""
        split = split_lot(self.quantity, self.expected_pieces)
        return split[1] if split else 0

    @computed_field  # type: ignore[prop-decorator]
    @property
    def shortage_pieces(self) -> int:
        return self.expected_pieces - int(self.received_pieces or 0)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def rejected_qty(self) -> float | int:
        """QED-rejected quantity entered on SAP Inward (0 when none was entered)."""
        return _clean_number(qty_entry_total(self.inward_scans, "rejected_qty")) or 0

    @computed_field  # type: ignore[prop-decorator]
    @property
    def shortage_qty(self) -> float | int | None:
        """Lot − received − QED rejected."""
        if self.quantity is None:
            return None
        recv = self.received_qty or Decimal(0)
        rejected = qty_entry_total(self.inward_scans, "rejected_qty")
        return _clean_number((self.quantity - recv - rejected).quantize(Decimal("0.001")))


#: ``entry_mode`` of an ``inward_scans`` entry holding entered quantities
#: (accepted / rejected) rather than one scanned piece.
QTY_ENTRY = "qty"


def qty_entries(scans: list[dict] | None) -> list[dict]:
    """The quantity-entry entries of a line's ``inward_scans``."""
    return [sc for sc in scans or [] if sc.get("entry_mode") == QTY_ENTRY]


def qty_entry_total(scans: list[dict] | None, key: str) -> Decimal:
    """Sum of ``key`` (``accepted_qty`` / ``rejected_qty``) over the quantity entries."""
    return sum(
        (Decimal(str(sc.get(key) or 0)) for sc in qty_entries(scans)), Decimal(0)
    )


def split_lot(quantity: Decimal | None, pieces: int) -> tuple[int, int] | None:
    """Split a lot into whole parts per piece: ``(base, extra)``.

    Parts are never fractional, so a lot of 467 over 19 pieces is 24 per piece
    with the first 11 pieces carrying 25 — every running total is a whole
    number and all pieces together add up to the lot.
    """
    if quantity is None or pieces <= 0:
        return None
    whole = int(quantity)
    return whole // pieces, whole % pieces


def piece_qty(quantity: Decimal | None, pieces: int, piece_no: int) -> int | None:
    """Whole parts carried by piece number ``piece_no`` (1-based)."""
    split = split_lot(quantity, pieces)
    if split is None:
        return None
    base, extra = split
    return base + (1 if piece_no <= extra else 0)


def received_qty_for(
    quantity: Decimal | None, pieces: int, received_pieces: int
) -> Decimal | None:
    """Whole parts received after ``received_pieces`` scans; the full lot once
    every expected piece is in."""
    split = split_lot(quantity, pieces)
    if quantity is None or split is None:
        return None
    if received_pieces >= pieces:
        return quantity
    base, extra = split
    return Decimal(base * received_pieces + min(received_pieces, extra))


def pieces_for_accepted(quantity: Decimal | None, pieces: int, accepted: Decimal) -> int:
    """Pieces implied by an entered accepted quantity.

    ``ceil(accepted / qty_per_piece)`` using the whole-part split of the lot
    (:func:`split_lot`), at least 1 when anything was accepted and never more
    than the expected ``pieces``. Lot 300 over 4 pieces is 75 per piece, so
    accepted 150 → 2 pieces. Nothing accepted → 0 pieces.
    """
    if accepted <= 0:
        return 0
    split = split_lot(quantity, pieces)
    per = split[0] if split and split[0] > 0 else 1
    return min(pieces, max(1, math.ceil(accepted / per)))


# --- sap inward (receiving) --------------------------------------------
InwardStatus =Literal["PENDING", "PARTIAL", "RECEIVED", "SHORT", "OVER"]


class SapInwardScanIn(BaseModel):
    """Scan one received piece. The Box UID resolves the outward line; PO / DC,
    when supplied, must match it.

    With ``accepted_qty`` the scan instead records the quantities from the
    vendor mail / QED sheet for the whole line (see ``sap_inward_scan``)."""

    box_uid: Str1
    po_no: str | None = Field(default=None, max_length=64)
    dc_no: str | None = Field(default=None, max_length=64)
    scanned_by: str | None = Field(default=None, max_length=64)
    accepted_qty: Decimal | None = Field(default=None, ge=0)
    rejected_qty: Decimal | None = Field(default=None, ge=0)

    @field_validator("accepted_qty")
    @classmethod
    def _accepted_splits_front_back(cls, v: Decimal | None) -> Decimal | None:
        if v is None:
            return v
        if v != v.to_integral_value():
            raise ValueError("Accepted qty must be a whole number")
        if int(v) % 2:
            raise ValueError("Accepted qty must split equally into front and back cases")
        return v

    @field_validator("rejected_qty")
    @classmethod
    def _rejected_whole(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v != v.to_integral_value():
            raise ValueError("QED rejected qty must be a whole number")
        return v

    @model_validator(mode="after")
    def _rejected_needs_accepted(self) -> SapInwardScanIn:
        if self.rejected_qty is not None and self.accepted_qty is None:
            raise ValueError("QED rejected qty can only be sent with the accepted qty")
        return self


class SapInwardScanOut(ORMModel):
    id: uuid.UUID
    sap_outward_id: uuid.UUID
    box_uid: str | None
    po_no: str | None
    dc_no: str | None
    piece_no: int
    qty: Decimal | None
    scanned_by: str | None
    scanned_at: datetime

    @field_serializer("qty")
    def _ser_qty(self, v: Decimal | None) -> int | float | None:
        return _clean_number(v)


class SapInwardScanResult(BaseModel):
    """What a scan tells the operator, in one payload."""

    matched: bool
    message: str
    scan: SapInwardScanOut | None = None
    outward: SapOutwardOut | None = None


class SapInwardCloseIn(BaseModel):
    note: str | None = Field(default=None, max_length=255)


# The four inward receipts checked before a line is verified, in the order
# their tags appear on the Status-service note.
INWARD_DOCUMENTS: dict[str, str] = {
    "gi_slip": "GI",
    "titan_challan": "DC",
    "vendor_challan": "VDC",
    "qed_sheet": "QED",
}
InwardDocument = Literal["gi_slip", "titan_challan", "vendor_challan", "qed_sheet"]


class SapInwardVerifyIn(BaseModel):
    """Documents the operator confirmed in the Verify window. When a body is
    sent, every one of the four must be listed."""

    documents_checked: list[InwardDocument] = Field(max_length=len(INWARD_DOCUMENTS))

    @field_validator("documents_checked")
    @classmethod
    def _all_documents(cls, v: list[str]) -> list[str]:
        missing = [d for d in INWARD_DOCUMENTS if d not in v]
        if missing:
            raise ValueError(f"every document must be checked; missing: {', '.join(missing)}")
        return v


class StatusLineOut(BaseModel):
    """A line's status at one stage, as recorded by the Status service."""

    sap_reference_id: str
    stage: str
    code: str
    label: str
    tone: str
    changed_at: datetime


# --- trays --------------------------------------------------------------
class TrayCreate(BaseModel):
    tray_id: Str1
    box_id: str | None = Field(default=None, max_length=64)
    tray_type: str | None = Field(default=None, max_length=32)
    no_of_trays: int = Field(default=1, ge=1)
    qty: Decimal | None = Field(default=None, ge=0)
    qty_capacity: Decimal | None = Field(default=None, ge=0)
    status: Status = "active"


class TrayUpdate(BaseModel):
    tray_id: str | None = Field(default=None, min_length=1, max_length=64)
    box_id: str | None = Field(default=None, max_length=64)
    tray_type: str | None = Field(default=None, max_length=32)
    no_of_trays: int | None = Field(default=None, ge=1)
    qty: Decimal | None = Field(default=None, ge=0)
    qty_capacity: Decimal | None = Field(default=None, ge=0)
    status: Status | None = None


class TrayOut(ORMModel):
    id: uuid.UUID
    tray_id: str
    box_id: str | None
    tray_type: str | None
    no_of_trays: int
    qty: Decimal | None
    qty_capacity: Decimal | None
    status: str
    created_at: datetime
    updated_at: datetime

    @field_serializer("qty", "qty_capacity")
    def _ser_qty(self, v: Decimal | None) -> int | float | None:
        return _clean_number(v)


# --- boxes -------------------------------------------------------------
class BoxCreate(BaseModel):
    box_uid: Str1
    box_type: str | None = Field(default=None, max_length=32)
    status: Status = "active"


class BoxUpdate(BaseModel):
    box_uid: str | None = Field(default=None, min_length=1, max_length=128)
    box_type: str | None = Field(default=None, max_length=32)
    status: Status | None = None


class BoxOut(ORMModel):
    id: uuid.UUID
    box_uid: str
    box_type: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class OutwardStatusMasterOut(ORMModel):
    id: uuid.UUID
    code: str
    label: str
    sort_order: int
    is_default: bool
    is_dispatched: bool
    status: str
    created_at: datetime
    updated_at: datetime


class MovementTypeMasterOut(ORMModel):
    id: uuid.UUID
    code: str
    description: str
    sort_order: int
    status: str
    created_at: datetime
    updated_at: datetime


class HealthOut(BaseModel):
    status: str
    service: str
    database: str
