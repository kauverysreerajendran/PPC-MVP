"""ORM models for `sap_db`.

Two tables:
  * ``sap_sync_run``        — one row per SAP pull/sync attempt.
  * ``sap_inward_record``   — the SAP inward document lines shown in the UI table.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    Numeric,
    String,
    Text,
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


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # `updated_at` is bumped by the `before_update` listener below (a plain Python
    # assignment) rather than a SQL `onupdate` — the latter leaves the attribute
    # expired after flush, which triggers MissingGreenlet under the async engine.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SapSyncRun(Base, TimestampMixin):
    __tablename__ = "sap_sync_run"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_system: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[str] = mapped_column(
        String(32), nullable=False, default="mock", server_default="mock"
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="RUNNING", server_default="RUNNING"
    )
    records_ingested: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SapInwardRecord(Base, TimestampMixin):
    __tablename__ = "sap_inward_record"
    __table_args__ = (
        UniqueConstraint("sap_reference_id", name="uq_sap_inward_record_sap_reference_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # --- SAP-sourced (written by the sync job, read-only in the UI) ---
    sap_reference_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    transaction_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    dc_no: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    po_no: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    material_no: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    model_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    material_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    vendor_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    vendor_name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    batch_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lot_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 3), nullable=True)
    movement_type: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # --- application-owned (the inputs edited from the frontend) ---
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- provenance ---
    source_system: Mapped[str] = mapped_column(String(64), nullable=False)
    sync_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sap_sync_run.id", ondelete="SET NULL"), nullable=True
    )


def _touch_updated_at(_mapper, _connection, target: TimestampMixin) -> None:
    target.updated_at = datetime.now(UTC)


for _model in (SapSyncRun, SapInwardRecord):
    event.listen(_model, "before_update", _touch_updated_at)
