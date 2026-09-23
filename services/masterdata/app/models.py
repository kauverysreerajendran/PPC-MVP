"""ORM models for the `masterdata` schema (single shared database).

Tables, all owned exclusively by this service:

  * ``master_models``   — model / model-number master
  * ``plating_colors``  — plating & colour master
  * ``vendors``         — vendor master
  * ``locations``       — self-referencing location hierarchy (Warehouse → Rack → Row → Shelf → Bin)
  * ``trays``           — tray master (tray id + box + capacity + type + count)
  * ``boxes``           — box master (barcode / box UID)
  * ``sap_outwards``    — SAP outward document lines, linked to the masters by
                          FK (``ON DELETE SET NULL``) while preserving the SAP
                          business codes; also carries ``box_uid`` + ``tray_id``,
                          the outward-status lifecycle and the receiving scans.

``sap_outwards`` is deliberately ONE table. It previously had two satellites —
``sap_outward_statuses`` (strictly 1:1, holding a status that was already
mirrored onto ``sap_outwards.outward_status``) and ``sap_inward_scans`` (one row
per scanned piece). Revision ``0020`` folded both in: the status note became the
``outward_status_note`` column and the per-piece scans became the ``inward_scans``
JSONB array. See docs/adr/0007-merge-sap-outward-satellites.md.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    event,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

STATUS_VALUES = ("active", "inactive")
LOCATION_TYPES = ("WAREHOUSE", "RACK", "ROW", "SHELF", "BIN")
OUTWARD_STATUS_VALUES = (
    "NEW",
    "ALLOCATED",
    "PACKED",
    "DISPATCHED",
    "HOLD",
    # a shortage back-order raised by SAP Inward, waiting to be dispatched again
    "PENDING",
)


#: schema this service owns inside the single shared PostgreSQL database
SCHEMA = "masterdata"


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


class MasterModel(Base, TimestampMixin, StatusMixin):
    __tablename__ = "master_models"
    __table_args__ = (
        UniqueConstraint("model_no", name="uq_master_models_model_no"),
        CheckConstraint("status IN ('active','inactive')", name="status_allowed"),
        Index("ix_master_models_model_name", "model_name"),
    )

    id: Mapped[uuid.UUID] = _pk()
    model_no: Mapped[str] = mapped_column(String(64), nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    part: Mapped[str | None] = mapped_column(String(64), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    uom: Mapped[str | None] = mapped_column(String(16), nullable=True)


class PlatingColor(Base, TimestampMixin, StatusMixin):
    __tablename__ = "plating_colors"
    __table_args__ = (
        UniqueConstraint("color_code", name="uq_plating_colors_color_code"),
        UniqueConstraint("color_name", name="uq_plating_colors_color_name"),
        CheckConstraint("status IN ('active','inactive')", name="status_allowed"),
    )

    id: Mapped[uuid.UUID] = _pk()
    color_code: Mapped[str] = mapped_column(String(32), nullable=False)
    color_name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class Vendor(Base, TimestampMixin, StatusMixin):
    __tablename__ = "vendors"
    __table_args__ = (
        UniqueConstraint("vendor_code", name="uq_vendors_vendor_code"),
        CheckConstraint("status IN ('active','inactive')", name="status_allowed"),
        Index("ix_vendors_vendor_name", "vendor_name"),
    )

    id: Mapped[uuid.UUID] = _pk()
    vendor_code: Mapped[str] = mapped_column(String(32), nullable=False)
    vendor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class Location(Base, TimestampMixin, StatusMixin):
    __tablename__ = "locations"
    __table_args__ = (
        UniqueConstraint("location_code", name="uq_locations_location_code"),
        CheckConstraint(
            "location_type IN ('WAREHOUSE','RACK','ROW','SHELF','BIN')",
            name="location_type_allowed",
        ),
        CheckConstraint("status IN ('active','inactive')", name="status_allowed"),
        CheckConstraint("id <> parent_location_id", name="no_self_parent"),
        Index("ix_locations_parent_location_id", "parent_location_id"),
        Index("ix_locations_location_type", "location_type"),
    )

    id: Mapped[uuid.UUID] = _pk()
    location_code: Mapped[str] = mapped_column(String(64), nullable=False)
    location_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location_type: Mapped[str] = mapped_column(String(16), nullable=False)
    parent_location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="RESTRICT"),
        nullable=True,
    )

    parent: Mapped[Location | None] = relationship(
        remote_side="Location.id", lazy="raise", backref="children"
    )


class Tray(Base, TimestampMixin, StatusMixin):
    """Tray master — physical trays used to hold parts, uploaded by tray id."""

    __tablename__ = "trays"
    __table_args__ = (
        UniqueConstraint("tray_id", name="uq_trays_tray_id"),
        CheckConstraint("status IN ('active','inactive')", name="status_allowed"),
        CheckConstraint("qty IS NULL OR qty >= 0", name="qty_non_negative"),
        CheckConstraint(
            "qty_capacity IS NULL OR qty_capacity >= 0", name="qty_capacity_non_negative"
        ),
        CheckConstraint(
            "qty IS NULL OR qty_capacity IS NULL OR qty <= qty_capacity",
            name="qty_within_capacity",
        ),
        CheckConstraint("no_of_trays >= 1", name="no_of_trays_positive"),
        Index("ix_trays_box_id", "box_id"),
        Index("ix_trays_tray_type", "tray_type"),
    )

    id: Mapped[uuid.UUID] = _pk()
    tray_id: Mapped[str] = mapped_column(String(64), nullable=False)
    box_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tray_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    no_of_trays: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 3), nullable=True)
    qty_capacity: Mapped[Decimal | None] = mapped_column(Numeric(18, 3), nullable=True)


class Box(Base, TimestampMixin, StatusMixin):
    """Box master — one row per physical box barcode (``box_uid``)."""

    __tablename__ = "boxes"
    __table_args__ = (
        UniqueConstraint("box_uid", name="uq_boxes_box_uid"),
        CheckConstraint("status IN ('active','inactive')", name="status_allowed"),
        Index("ix_boxes_box_type", "box_type"),
    )

    id: Mapped[uuid.UUID] = _pk()
    box_uid: Mapped[str] = mapped_column(String(128), nullable=False)
    box_type: Mapped[str | None] = mapped_column(String(32), nullable=True)


class OutwardStatusMaster(Base, TimestampMixin, StatusMixin):
    """Master list of outward-status values — the lookup behind the SAP Outward
    ``Outward Status`` column. Editable from ``/masterdata-admin``."""

    __tablename__ = "outward_status_master"
    __table_args__ = (
        UniqueConstraint("code", name="uq_outward_status_master_code"),
        CheckConstraint("status IN ('active','inactive')", name="status_allowed"),
    )

    id: Mapped[uuid.UUID] = _pk()
    code: Mapped[str] = mapped_column(String(16), nullable=False)
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_dispatched: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )


class MovementTypeMaster(Base, TimestampMixin, StatusMixin):
    """Master list of SAP movement-type codes — the lookup behind the SAP
    Upload ``SAP`` column hover text. Editable from ``/masterdata-admin``."""

    __tablename__ = "movement_type_master"
    __table_args__ = (
        UniqueConstraint("code", name="uq_movement_type_master_code"),
        CheckConstraint("status IN ('active','inactive')", name="status_allowed"),
    )

    id: Mapped[uuid.UUID] = _pk()
    code: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class SapOutward(Base, TimestampMixin, StatusMixin):
    __tablename__ = "sap_outwards"
    __table_args__ = (
        UniqueConstraint("sap_reference_id", name="uq_sap_outwards_sap_reference_id"),
        CheckConstraint("status IN ('active','inactive')", name="status_allowed"),
        CheckConstraint("quantity IS NULL OR quantity >= 0", name="quantity_non_negative"),
        Index("ix_sap_outwards_transaction_date", "transaction_date"),
        Index("ix_sap_outwards_sap_document_no", "sap_document_no"),
        Index("ix_sap_outwards_po_no", "po_no"),
        Index("ix_sap_outwards_material_no", "material_no"),
        Index("ix_sap_outwards_box_uid", "box_uid"),
        Index("ix_sap_outwards_tray_id", "tray_id"),
        Index("ix_sap_outwards_tray_type", "tray_type"),
        Index("ix_sap_outwards_outward_status", "outward_status"),
        Index("ix_sap_outwards_inward_status", "inward_status"),
        Index("ix_sap_outwards_parent_sap_reference_id", "parent_sap_reference_id"),
        CheckConstraint(
            "inward_status IS NULL OR inward_status IN "
            "('PENDING','PARTIAL','RECEIVED','SHORT','OVER')",
            name="inward_status_allowed",
        ),
        CheckConstraint("received_pieces >= 0", name="received_pieces_non_negative"),
        CheckConstraint(
            "outward_status IS NULL OR outward_status IN "
            "('NEW','ALLOCATED','PACKED','DISPATCHED','HOLD','PENDING')",
            name="outward_status_allowed",
        ),
        CheckConstraint(
            "no_of_trays IS NULL OR no_of_trays >= 1", name="no_of_trays_positive"
        ),
        CheckConstraint(
            "(front_case_trays IS NULL OR front_case_trays >= 0) AND "
            "(back_case_trays IS NULL OR back_case_trays >= 0)",
            name="case_trays_non_negative",
        ),
        Index("ix_sap_outwards_model_id", "model_id"),
        Index("ix_sap_outwards_vendor_id", "vendor_id"),
        Index("ix_sap_outwards_plating_color_id", "plating_color_id"),
        Index("ix_sap_outwards_location_id", "location_id"),
    )

    id: Mapped[uuid.UUID] = _pk()

    # --- SAP business identifiers (preserved verbatim) ---
    sap_reference_id: Mapped[str] = mapped_column(String(64), nullable=False)
    sap_document_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    transaction_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    dc_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    po_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    material_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vendor_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    batch_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lot_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(18, 3), nullable=True)
    movement_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    source_system: Mapped[str] = mapped_column(
        String(64), nullable=False, default="SAP-ECC", server_default="SAP-ECC"
    )

    # --- provenance (revision 0023) ---
    #: the line a shortage back-order was raised from; NULL for a feed line.
    parent_sap_reference_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    #: how this line came to be: 'SAP' (the feed) or 'SHORTAGE' (raised by SAP
    #: Inward for the balance left over after the accepted qty was recorded).
    origin: Mapped[str | None] = mapped_column(
        String(16), nullable=True, default="SAP", server_default="SAP"
    )

    # --- shortage snapshot (revision 0024) ---
    # A back-order carries only the shortage as its own lot qty, which on its
    # own is unaccountable. These four columns freeze the parent's figures at
    # the moment the back-order was raised, so the quantity trail
    # (lot → accepted / rejected → received → shortage) stays truthful even if
    # the parent is later reset or received again. NULL on every other line.
    shortage_parent_lot_qty: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 3), nullable=True
    )
    shortage_parent_accepted_qty: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 3), nullable=True
    )
    shortage_parent_rejected_qty: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 3), nullable=True
    )
    shortage_parent_received_qty: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 3), nullable=True
    )

    # --- box / tray / status tracking (validated against the masters) ---
    box_uid: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tray_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tray_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    no_of_trays: Mapped[int | None] = mapped_column(Integer, nullable=True)
    front_case_trays: Mapped[int | None] = mapped_column(Integer, nullable=True)
    back_case_trays: Mapped[int | None] = mapped_column(Integer, nullable=True)
    outward_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    #: free-text note against the current outward status (was
    #: ``sap_outward_statuses.note`` before revision 0020)
    outward_status_note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # --- SAP inward (receiving verification) ---
    # Front + back cases come back attached as one physical piece; the operator
    # scans each piece and the count is tallied here. ``received_qty`` is the
    # running received amount against the lot; shortage = quantity - received_qty.
    received_pieces: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    received_qty: Mapped[Decimal | None] = mapped_column(Numeric(18, 3), nullable=True)
    inward_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    inward_last_scan_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    #: One entry per physically scanned piece — was the ``sap_inward_scans``
    #: table before revision 0020. Each entry:
    #:   {id, box_uid, po_no, dc_no, piece_no, qty, scanned_by, scanned_at}
    #: Always REPLACE this list (never mutate in place) so SQLAlchemy sees the
    #: change; plain JSONB columns have no mutation tracking.
    inward_scans: Mapped[list[dict]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )

    # --- relational foreign keys to the masters (ON DELETE SET NULL) ---
    model_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("master_models.id", ondelete="SET NULL"), nullable=True
    )
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True
    )
    plating_color_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plating_colors.id", ondelete="SET NULL"), nullable=True
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )

    model: Mapped[MasterModel | None] = relationship(lazy="raise")
    vendor: Mapped[Vendor | None] = relationship(lazy="raise")
    plating_color: Mapped[PlatingColor | None] = relationship(lazy="raise")
    location: Mapped[Location | None] = relationship(lazy="raise")


def _touch_updated_at(_mapper, _connection, target: TimestampMixin) -> None:
    target.updated_at = datetime.now(UTC)


for _model in (
    MasterModel,
    PlatingColor,
    Vendor,
    Location,
    Tray,
    Box,
    OutwardStatusMaster,
    MovementTypeMaster,
    SapOutward,
):
    event.listen(_model, "before_update", _touch_updated_at)
