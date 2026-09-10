"""Request / response models. These are the service's published contract."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_serializer

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

    @field_serializer("quantity")
    def _ser_quantity(self, v: Decimal | None) -> int | float | None:
        return _clean_number(v)


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


class HealthOut(BaseModel):
    status: str
    service: str
    database: str
