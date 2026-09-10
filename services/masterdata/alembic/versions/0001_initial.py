"""initial masterdata schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUS_CK = "status IN ('active','inactive')"


def _audit_cols() -> list[sa.Column]:
    return [
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "master_models",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("model_no", sa.String(length=64), nullable=False),
        sa.Column("model_name", sa.String(length=255), nullable=True),
        sa.Column("part", sa.String(length=64), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("uom", sa.String(length=16), nullable=True),
        *_audit_cols(),
        sa.PrimaryKeyConstraint("id", name="pk_master_models"),
        sa.UniqueConstraint("model_no", name="uq_master_models_model_no"),
        sa.CheckConstraint(_STATUS_CK, name="ck_master_models_status_allowed"),
    )
    op.create_index("ix_master_models_model_name", "master_models", ["model_name"])

    op.create_table(
        "plating_colors",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("color_code", sa.String(length=32), nullable=False),
        sa.Column("color_name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        *_audit_cols(),
        sa.PrimaryKeyConstraint("id", name="pk_plating_colors"),
        sa.UniqueConstraint("color_code", name="uq_plating_colors_color_code"),
        sa.UniqueConstraint("color_name", name="uq_plating_colors_color_name"),
        sa.CheckConstraint(_STATUS_CK, name="ck_plating_colors_status_allowed"),
    )

    op.create_table(
        "vendors",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("vendor_code", sa.String(length=32), nullable=False),
        sa.Column("vendor_name", sa.String(length=255), nullable=False),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("contact_phone", sa.String(length=32), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        *_audit_cols(),
        sa.PrimaryKeyConstraint("id", name="pk_vendors"),
        sa.UniqueConstraint("vendor_code", name="uq_vendors_vendor_code"),
        sa.CheckConstraint(_STATUS_CK, name="ck_vendors_status_allowed"),
    )
    op.create_index("ix_vendors_vendor_name", "vendors", ["vendor_name"])

    op.create_table(
        "locations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("location_code", sa.String(length=64), nullable=False),
        sa.Column("location_name", sa.String(length=255), nullable=True),
        sa.Column("location_type", sa.String(length=16), nullable=False),
        sa.Column("parent_location_id", postgresql.UUID(as_uuid=True), nullable=True),
        *_audit_cols(),
        sa.PrimaryKeyConstraint("id", name="pk_locations"),
        sa.UniqueConstraint("location_code", name="uq_locations_location_code"),
        sa.ForeignKeyConstraint(
            ["parent_location_id"], ["locations.id"],
            name="fk_locations_parent_location_id_locations", ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "location_type IN ('WAREHOUSE','RACK','ROW','SHELF','BIN')",
            name="ck_locations_location_type_allowed",
        ),
        sa.CheckConstraint(_STATUS_CK, name="ck_locations_status_allowed"),
        sa.CheckConstraint("id <> parent_location_id", name="ck_locations_no_self_parent"),
    )
    op.create_index("ix_locations_parent_location_id", "locations", ["parent_location_id"])
    op.create_index("ix_locations_location_type", "locations", ["location_type"])

    op.create_table(
        "sap_inwards",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sap_reference_id", sa.String(length=64), nullable=False),
        sa.Column("sap_document_no", sa.String(length=64), nullable=True),
        sa.Column("transaction_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dc_no", sa.String(length=64), nullable=True),
        sa.Column("po_no", sa.String(length=64), nullable=True),
        sa.Column("material_no", sa.String(length=64), nullable=True),
        sa.Column("material_description", sa.Text(), nullable=True),
        sa.Column("model_no", sa.String(length=64), nullable=True),
        sa.Column("vendor_code", sa.String(length=32), nullable=True),
        sa.Column("batch_no", sa.String(length=64), nullable=True),
        sa.Column("lot_no", sa.String(length=64), nullable=True),
        sa.Column("quantity", sa.Numeric(precision=18, scale=3), nullable=True),
        sa.Column("movement_type", sa.String(length=16), nullable=True),
        sa.Column("source_system", sa.String(length=64), nullable=False, server_default="SAP-ECC"),
        sa.Column("model_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("plating_color_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True),
        *_audit_cols(),
        sa.PrimaryKeyConstraint("id", name="pk_sap_inwards"),
        sa.UniqueConstraint("sap_reference_id", name="uq_sap_inwards_sap_reference_id"),
        sa.CheckConstraint(_STATUS_CK, name="ck_sap_inwards_status_allowed"),
        sa.CheckConstraint(
            "quantity IS NULL OR quantity >= 0", name="ck_sap_inwards_quantity_non_negative"
        ),
        sa.ForeignKeyConstraint(
            ["model_id"], ["master_models.id"],
            name="fk_sap_inwards_model_id_master_models", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["vendor_id"], ["vendors.id"],
            name="fk_sap_inwards_vendor_id_vendors", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["plating_color_id"], ["plating_colors.id"],
            name="fk_sap_inwards_plating_color_id_plating_colors", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["location_id"], ["locations.id"],
            name="fk_sap_inwards_location_id_locations", ondelete="RESTRICT",
        ),
    )
    for col in (
        "transaction_date", "sap_document_no", "po_no", "material_no",
        "model_id", "vendor_id", "plating_color_id", "location_id",
    ):
        op.create_index(f"ix_sap_inwards_{col}", "sap_inwards", [col])


def downgrade() -> None:
    op.drop_table("sap_inwards")
    op.drop_table("locations")
    op.drop_table("vendors")
    op.drop_table("plating_colors")
    op.drop_table("master_models")
