"""Request / response contracts for the Status Service."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")

Stage = Literal["outward", "inward", "rack"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class DefinitionOut(ORMModel):
    stage: str
    code: str
    label: str
    tone: str
    sort_order: int
    is_initial: bool


class EventIn(BaseModel):
    """Report that a SAP line reached a status at a stage."""

    sap_reference_id: str = Field(min_length=1, max_length=64)
    stage: Stage
    code: str = Field(min_length=1, max_length=32)
    note: str | None = Field(default=None, max_length=255)
    #: the end user the change is attributed to; defaults to the caller
    actor: str | None = Field(default=None, max_length=64)
    #: the reporting service; defaults to the token subject
    source: str | None = Field(default=None, max_length=64)


class EventBatchIn(BaseModel):
    """Several changes applied together — all succeed or none do."""

    events: list[EventIn] = Field(min_length=1, max_length=100)


class LineStatusOut(BaseModel):
    sap_reference_id: str
    stage: str
    code: str
    label: str
    tone: str
    note: str | None
    actor: str | None
    source: str | None
    changed_at: datetime


class ChangeOut(BaseModel):
    #: false when the line was already in that status (nothing recorded)
    changed: bool
    line: LineStatusOut


class EventOut(ORMModel):
    id: uuid.UUID
    sap_reference_id: str
    stage: str
    code: str
    previous_code: str | None
    note: str | None
    actor: str | None
    source: str | None
    occurred_at: datetime


class LineDetailOut(BaseModel):
    sap_reference_id: str
    #: current status per stage (stages never reported are absent)
    stages: dict[str, LineStatusOut]
    #: every change, newest first
    history: list[EventOut]


class RefsOut(BaseModel):
    stage: str
    code: str
    count: int
    refs: list[str]


class HealthOut(BaseModel):
    status: str
    service: str
    database: str
