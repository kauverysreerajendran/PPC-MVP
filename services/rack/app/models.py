"""ORM models for the `rack` schema (single shared database).

Two tables, owned exclusively by this service:

  * ``rack_master`` — the *physical topology master*. One row per physical rack
                      in a warehouse aisle, describing how that rack is built:
                      how many shelves it has, how many vertical rows sit on a
                      shelf and how many trays fit horizontally in a row. This
                      is the master that is uploaded/maintained first; every
                      storage location in the system is derived from it.

  * ``rack`` — one physical tray slot, materialised from a ``rack_master`` row
               (``warehouse_code`` / ``aisle_code`` / ``rack_code`` +
               ``shelf_no`` / ``row_no`` / ``tray_no``) plus its dynamic
               occupancy: ``slot_state``, ``occupied``, ``occupied_by_model``
               (a model_no business identifier from the Masterdata service) and
               ``date_of_occupied``.

The physical hierarchy the two tables encode:

    Warehouse -> Aisle -> Rack -> Shelf -> Row -> Tray

Nothing about that hierarchy is fixed in code: shelf / row / tray counts are
per-rack columns on ``rack_master``, so one aisle may hold 6x4x15 racks and the
next 5x3x12 racks.

Cross-service rule (BLUEPRINT §12): this service never touches the ``masterdata``
database. ``occupied_by_model`` stores the model_no verbatim; validation, when
enabled, goes through the Masterdata REST API.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    MetaData,
    Numeric,
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
#: dynamic occupancy states a materialised tray slot can be in
SLOT_STATES = ("empty", "occupied", "reserved", "blocked")


#: schema this service owns inside the single shared PostgreSQL database
SCHEMA = "rack"


class Base(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA, naming_convention=NAMING_CONVENTION)


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
    """Soft-delete strategy: rows are deactivated, never physically removed."""

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default="active"
    )


def location_code(rack_code: str, shelf_no: int, row_no: int, tray_no: int) -> str:
    """Canonical searchable location code, e.g. K-S4-R2-T05."""
    return f"{rack_code}-S{shelf_no}-R{row_no}-T{tray_no:02d}"


class RackMaster(Base, TimestampMixin, StatusMixin):
    """One physical rack and the shape of it — the topology master."""

    __tablename__ = "rack_master"
    __table_args__ = (
        UniqueConstraint(
            "warehouse_code", "aisle_code", "rack_code", name="uq_rack_master_rack"
        ),
        CheckConstraint("status IN ('active','inactive')", name="status_allowed"),
        CheckConstraint("shelf_count BETWEEN 1 AND 40", name="shelf_count_range"),
        CheckConstraint("row_count BETWEEN 1 AND 40", name="row_count_range"),
        CheckConstraint("tray_count BETWEEN 1 AND 100", name="tray_count_range"),
        Index("ix_rack_master_warehouse_code", "warehouse_code"),
        Index("ix_rack_master_aisle_code", "aisle_code"),
    )

    id: Mapped[uuid.UUID] = _pk()

    # --- where the rack physically stands ---
    warehouse_code: Mapped[str] = mapped_column(String(32), nullable=False)
    warehouse_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    aisle_code: Mapped[str] = mapped_column(String(32), nullable=False)
    aisle_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rack_code: Mapped[str] = mapped_column(String(32), nullable=False)
    rack_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    #: left-to-right order of this rack along the aisle (drives the aisle map)
    position: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default=text("1")
    )
    #: which side of the aisle the rack faces — free-form label, e.g. "L" / "R"
    side: Mapped[str | None] = mapped_column(String(8), nullable=True)

    # --- how the rack is built (the dynamic part) ---
    shelf_count: Mapped[int] = mapped_column(Integer, nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    tray_count: Mapped[int] = mapped_column(Integer, nullable=False)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def capacity(self) -> int:
        return self.shelf_count * self.row_count * self.tray_count


class Rack(Base, TimestampMixin, StatusMixin):
    """One materialised tray slot, derived from a :class:`RackMaster` row."""

    __tablename__ = "rack"
    __table_args__ = (
        # one physical tray per (warehouse, aisle, rack, shelf, row, tray)
        UniqueConstraint(
            "warehouse_code",
            "aisle_code",
            "rack_code",
            "shelf_no",
            "row_no",
            "tray_no",
            name="uq_rack_slot",
        ),
        CheckConstraint("status IN ('active','inactive')", name="status_allowed"),
        CheckConstraint("shelf_no >= 1", name="shelf_no_positive"),
        CheckConstraint("row_no >= 1", name="row_no_positive"),
        CheckConstraint("tray_no >= 1", name="tray_no_positive"),
        CheckConstraint(
            "slot_state IN ('empty','occupied','reserved','blocked')",
            name="slot_state_allowed",
        ),
        # an occupied slot must name the model that occupies it, and the two
        # occupancy columns must never disagree
        CheckConstraint(
            "occupied = false OR occupied_by_model IS NOT NULL",
            name="occupied_requires_model",
        ),
        CheckConstraint(
            "(occupied = true AND slot_state = 'occupied')"
            " OR (occupied = false AND slot_state <> 'occupied')",
            name="slot_state_matches_occupied",
        ),
        Index("ix_rack_rack_code", "rack_code"),
        Index("ix_rack_occupied", "occupied"),
        Index("ix_rack_occupied_by_model", "occupied_by_model"),
        Index("ix_rack_date_of_occupied", "date_of_occupied"),
        Index("ix_rack_slot_state", "slot_state"),
        Index("ix_rack_location", "warehouse_code", "aisle_code", "rack_code"),
        Index("ix_rack_lot_no", "lot_no"),
        Index("ix_rack_sap_reference_id", "sap_reference_id"),
        CheckConstraint(
            "placement_source IS NULL OR placement_source IN ('allocation','receiving')",
            name="placement_source_allowed",
        ),
    )

    id: Mapped[uuid.UUID] = _pk()

    # --- physical slot identity: warehouse > aisle > rack > shelf > row > tray ---
    warehouse_code: Mapped[str] = mapped_column(String(32), nullable=False)
    aisle_code: Mapped[str] = mapped_column(String(32), nullable=False)
    rack_code: Mapped[str] = mapped_column(String(32), nullable=False)
    shelf_no: Mapped[int] = mapped_column(Integer, nullable=False)
    row_no: Mapped[int] = mapped_column(Integer, nullable=False)
    tray_no: Mapped[int] = mapped_column(Integer, nullable=False)
    # human label from the physical rack chart, e.g. "KL 1" / "KR 20"
    location_name: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # --- dynamic occupancy (filled when a model is placed in the slot) ---
    slot_state: Mapped[str] = mapped_column(
        String(16), nullable=False, default="empty", server_default="empty"
    )
    occupied: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    occupied_by_model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    date_of_occupied: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # --- what's in the tray, when it came from a SAP outward line ---
    # ``qty`` is this tray's slice of the lot (the lot is split across trays);
    # ``lot_no`` / ``sap_reference_id`` trace it back to the SAP outward document
    # and double as the idempotency key for the allocator.
    qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 3), nullable=True)
    lot_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sap_reference_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    #: how the tray was filled — NULL / "allocation" = the outward allocator,
    #: "receiving" = a received piece placed from SAP Inward (``POST /place``)
    placement_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def code(self) -> str:
        return location_code(self.rack_code, self.shelf_no, self.row_no, self.tray_no)


def _touch_updated_at(_mapper, _connection, target: TimestampMixin) -> None:
    target.updated_at = datetime.now(UTC)


event.listen(Rack, "before_update", _touch_updated_at)
event.listen(RackMaster, "before_update", _touch_updated_at)
