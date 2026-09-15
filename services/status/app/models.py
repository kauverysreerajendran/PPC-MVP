"""ORM models for the `status` schema (single shared database).

Three tables, owned exclusively by this service:

  * ``status_definition`` — master of the status codes each stage may take
                            (label, colour tone, display order). Screens read
                            labels from here instead of hardcoding them.
  * ``line_status``       — the CURRENT status of one SAP line at one stage:
                            one row per ``sap_reference_id`` + ``stage``.
  * ``status_event``      — append-only history. Every change, what it changed
                            from, who made it and which service reported it.

Other services never keep their own copy of these statuses. They post a change
here (``POST /events``) and read the current value back (``GET /lines``), so a
status is derived the same way on every screen.

Stages follow the physical flow of one SAP line:

    outward  (Dispatched -> Received)
    inward   (Not received -> Yet to verify -> Verified)
    rack     (Not placed -> Partially placed -> Placed)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    MetaData,
    String,
    UniqueConstraint,
    event,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

#: schema this service owns inside the single shared PostgreSQL database
SCHEMA = "status"

STAGES = ("outward", "inward", "rack")
TONES = ("neutral", "info", "success", "warning", "orange", "danger", "progress")

_STAGE_CHECK = "stage IN ('outward','inward','rack')"


class Base(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA, naming_convention=NAMING_CONVENTION)


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class StatusDefinition(Base, TimestampMixin):
    """One allowed status of a stage — the master behind every status label."""

    __tablename__ = "status_definition"
    __table_args__ = (
        UniqueConstraint("stage", "code", name="uq_status_definition_stage_code"),
        CheckConstraint(_STAGE_CHECK, name="stage_allowed"),
        CheckConstraint(
            "tone IN ('neutral','info','success','warning','orange','danger','progress')",
            name="tone_allowed",
        ),
        CheckConstraint("status IN ('active','inactive')", name="status_allowed"),
    )

    id: Mapped[uuid.UUID] = _pk()
    stage: Mapped[str] = mapped_column(String(16), nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    tone: Mapped[str] = mapped_column(String(16), nullable=False, default="neutral")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: the status a line is in at this stage before anything was reported
    is_initial: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")


class LineStatus(Base, TimestampMixin):
    """Current status of one SAP line at one stage."""

    __tablename__ = "line_status"
    __table_args__ = (
        UniqueConstraint("sap_reference_id", "stage", name="uq_line_status_ref_stage"),
        CheckConstraint(_STAGE_CHECK, name="stage_allowed"),
        Index("ix_line_status_stage_code", "stage", "code"),
    )

    id: Mapped[uuid.UUID] = _pk()
    sap_reference_id: Mapped[str] = mapped_column(String(64), nullable=False)
    stage: Mapped[str] = mapped_column(String(16), nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    #: user (or service) the change is attributed to
    actor: Mapped[str | None] = mapped_column(String(64), nullable=True)
    #: service that reported it, e.g. "masterdata-service"
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class StatusEvent(Base):
    """One status change — never updated, never deleted."""

    __tablename__ = "status_event"
    __table_args__ = (
        CheckConstraint(_STAGE_CHECK, name="stage_allowed"),
        Index("ix_status_event_sap_reference_id", "sap_reference_id"),
        Index("ix_status_event_occurred_at", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = _pk()
    sap_reference_id: Mapped[str] = mapped_column(String(64), nullable=False)
    stage: Mapped[str] = mapped_column(String(16), nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    previous_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


def _touch_updated_at(_mapper, _connection, target: TimestampMixin) -> None:
    target.updated_at = datetime.now(UTC)


event.listen(StatusDefinition, "before_update", _touch_updated_at)
event.listen(LineStatus, "before_update", _touch_updated_at)
