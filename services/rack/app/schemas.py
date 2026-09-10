"""Request / response models. These are the service's published contract."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

T = TypeVar("T")

Status = Literal["active", "inactive"]

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


# --- rack slots ------------------------------------------------------------
class RackBase(BaseModel):
    rack_code: Code
    row_no: int = Field(ge=1)
    column_no: int = Field(ge=1)
    shelf_no: int = Field(ge=1)
    location_name: str | None = Field(default=None, max_length=64)
    occupied: bool = False
    occupied_by_model: str | None = Field(default=None, max_length=64)
    date_of_occupied: datetime | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _occupied_needs_model(self) -> RackBase:
        if self.occupied and not self.occupied_by_model:
            raise ValueError("occupied_by_model is required when occupied is true")
        return self


class RackCreate(RackBase):
    status: Status = "active"


class RackUpdate(BaseModel):
    rack_code: str | None = Field(default=None, min_length=1, max_length=32)
    row_no: int | None = Field(default=None, ge=1)
    column_no: int | None = Field(default=None, ge=1)
    shelf_no: int | None = Field(default=None, ge=1)
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


class RackOut(ORMModel):
    id: uuid.UUID
    rack_code: str
    row_no: int
    column_no: int
    shelf_no: int
    location_name: str | None
    occupied: bool
    occupied_by_model: str | None
    date_of_occupied: datetime | None
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class HealthOut(BaseModel):
    status: str
    service: str
    database: str
