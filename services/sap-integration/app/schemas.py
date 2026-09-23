"""Request / response models. These are the service's published contract."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class EnumsOut(BaseModel):
    """Everything the UI needs to render the table without hard-coded values."""

    movement_types: list[str]
    columns: list["ColumnDef"]


class ColumnDef(BaseModel):
    key: str
    header: str
    editable: bool = False
    type: str = "text"  # text | number | date


class SapInwardRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: uuid.UUID
    sap_reference_id: str
    transaction_date: datetime
    dc_no: str | None
    po_no: str | None
    material_no: str | None
    model_no: str | None
    material_description: str | None
    vendor_code: str | None
    vendor_name: str | None
    batch_no: str | None
    lot_no: str | None
    quantity: Decimal | None
    movement_type: str | None
    remark: str | None
    source_system: str
    sync_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class SapInwardRecordUpdate(BaseModel):
    """The only fields a frontend user may change."""

    remark: str | None = Field(default=None, max_length=4000)
    quantity: Decimal | None = Field(default=None, gt=0)

    @field_validator("quantity")
    @classmethod
    def _even_lot(cls, v: Decimal | None) -> Decimal | None:
        # A lot is split down the middle into front and back cases, so an odd
        # (or fractional) lot qty can never divide equally.
        if v is None:
            return v
        if v != v.to_integral_value():
            raise ValueError("lot qty must be a whole number")
        if int(v) % 2 != 0:
            raise ValueError("lot qty must be an even number so it splits equally")
        return v.to_integral_value()


class SyncRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_system: str
    provider: str
    status: str
    records_ingested: int
    error: str | None
    triggered_by: str | None
    started_at: datetime
    finished_at: datetime | None


class SyncTriggerIn(BaseModel):
    # Optional knobs for the mock provider; ignored by real providers for now.
    count: int | None = Field(default=None, ge=1, le=500)


EnumsOut.model_rebuild()
