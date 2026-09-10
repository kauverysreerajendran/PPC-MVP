"""tray master

Revision ID: 0004_trays
Revises: 0003_seed_vendors
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_trays"
down_revision: str | None = "0003_seed_vendors"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "trays",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tray_id", sa.String(length=64), nullable=False),
        sa.Column("box_id", sa.String(length=64), nullable=True),
        sa.Column("tray_type", sa.String(length=32), nullable=True),
        sa.Column("no_of_trays", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("qty", sa.Numeric(precision=18, scale=3), nullable=True),
        sa.Column("qty_capacity", sa.Numeric(precision=18, scale=3), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_trays"),
        sa.UniqueConstraint("tray_id", name="uq_trays_tray_id"),
        sa.CheckConstraint("status IN ('active','inactive')", name="ck_trays_status_allowed"),
        sa.CheckConstraint("qty IS NULL OR qty >= 0", name="ck_trays_qty_non_negative"),
        sa.CheckConstraint(
            "qty_capacity IS NULL OR qty_capacity >= 0",
            name="ck_trays_qty_capacity_non_negative",
        ),
        sa.CheckConstraint(
            "qty IS NULL OR qty_capacity IS NULL OR qty <= qty_capacity",
            name="ck_trays_qty_within_capacity",
        ),
        sa.CheckConstraint("no_of_trays >= 1", name="ck_trays_no_of_trays_positive"),
    )
    op.create_index("ix_trays_box_id", "trays", ["box_id"])
    op.create_index("ix_trays_tray_type", "trays", ["tray_type"])


def downgrade() -> None:
    op.drop_table("trays")
