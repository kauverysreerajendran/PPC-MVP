"""ORM models for the `rack` database.

One table, owned exclusively by this service:

  * ``rack`` — one physical rack slot (``rack_code`` + ``row_no`` / ``column_no``
                / ``shelf_no``) plus its dynamic occupancy: whether it is
                ``occupied``, ``occupied_by_model`` (a model_no business
                identifier from the Masterdata service) and ``date_of_occupied``.

Cross-service rule (BLUEPRINT §12): this service never touches the ``masterdata``
database. ``occupied_by_model`` stores the model_no verbatim; validation, when
enabled, goes through the Masterdata REST API.
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
    Text,
    UniqueConstraint,
    event,
    func,
    text,
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

STATUS_VALUES = ("active", "inactive")


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Bumped by the `before_update` listener below (a plain Python assignment)
    # rather than a SQL `onupdate` — the latter leaves the attribute expired
    # after flush, which trips MissingGreenlet under the async engine.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class StatusMixin:
    """Soft-delete strategy: slots are deactivated, never physically removed."""

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default="active"
    )


class Rack(Base, TimestampMixin, StatusMixin):
    __tablename__ = "rack"
    __table_args__ = (
        # one physical slot per (rack, row, column, shelf)
        UniqueConstraint(
            "rack_code", "row_no", "column_no", "shelf_no", name="uq_rack_slot"
        ),
        CheckConstraint("status IN ('active','inactive')", name="status_allowed"),
        CheckConstraint("row_no >= 1", name="row_no_positive"),
        CheckConstraint("column_no >= 1", name="column_no_positive"),
        CheckConstraint("shelf_no >= 1", name="shelf_no_positive"),
        # an occupied slot must name the model that occupies it
        CheckConstraint(
            "occupied = false OR occupied_by_model IS NOT NULL",
            name="occupied_requires_model",
        ),
        Index("ix_rack_rack_code", "rack_code"),
        Index("ix_rack_occupied", "occupied"),
        Index("ix_rack_occupied_by_model", "occupied_by_model"),
        Index("ix_rack_date_of_occupied", "date_of_occupied"),
    )

    id: Mapped[uuid.UUID] = _pk()

    # --- physical slot identity ---
    rack_code: Mapped[str] = mapped_column(String(32), nullable=False)
    row_no: Mapped[int] = mapped_column(Integer, nullable=False)
    column_no: Mapped[int] = mapped_column(Integer, nullable=False)
    shelf_no: Mapped[int] = mapped_column(Integer, nullable=False)
    # human label from the physical rack chart, e.g. "KL 1" / "KR 20"
    location_name: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # --- dynamic occupancy (filled when a model is placed in the slot) ---
    occupied: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    occupied_by_model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    date_of_occupied: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


def _touch_updated_at(_mapper, _connection, target: TimestampMixin) -> None:
    target.updated_at = datetime.now(UTC)


event.listen(Rack, "before_update", _touch_updated_at)
