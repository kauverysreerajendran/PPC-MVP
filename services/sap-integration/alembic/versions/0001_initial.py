"""initial sap_db schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-09
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

def upgrade() -> None:
    op.create_table(
        "sap_sync_run",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_system", sa.String(length=64), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="mock"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="RUNNING"),
        sa.Column("records_ingested", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("triggered_by", sa.String(length=64), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_sap_sync_run"),
    )

    op.create_table(
        "sap_inward_record",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sap_reference_id", sa.String(length=64), nullable=False),
        sa.Column("transaction_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dc_no", sa.String(length=64), nullable=True),
        sa.Column("po_no", sa.String(length=64), nullable=True),
        sa.Column("material_no", sa.String(length=64), nullable=True),
        sa.Column("model_no", sa.String(length=64), nullable=True),
        sa.Column("material_description", sa.Text(), nullable=True),
        sa.Column("vendor_code", sa.String(length=32), nullable=True),
        sa.Column("vendor_name", sa.String(length=255), nullable=True),
        sa.Column("batch_no", sa.String(length=64), nullable=True),
        sa.Column("lot_no", sa.String(length=64), nullable=True),
        sa.Column("quantity", sa.Numeric(precision=18, scale=3), nullable=True),
        sa.Column("movement_type", sa.String(length=16), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("source_system", sa.String(length=64), nullable=False),
        sa.Column("sync_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_sap_inward_record"),
        sa.ForeignKeyConstraint(
            ["sync_id"], ["sap_sync_run.id"],
            name="fk_sap_inward_record_sync_id_sap_sync_run",
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("sap_reference_id", name="uq_sap_inward_record_sap_reference_id"),
    )
    op.create_index("ix_sap_inward_record_sap_reference_id", "sap_inward_record", ["sap_reference_id"])
    op.create_index("ix_sap_inward_record_dc_no", "sap_inward_record", ["dc_no"])
    op.create_index("ix_sap_inward_record_po_no", "sap_inward_record", ["po_no"])
    op.create_index("ix_sap_inward_record_material_no", "sap_inward_record", ["material_no"])
    op.create_index("ix_sap_inward_record_vendor_name", "sap_inward_record", ["vendor_name"])


def downgrade() -> None:
    op.drop_table("sap_inward_record")
    op.drop_table("sap_sync_run")
