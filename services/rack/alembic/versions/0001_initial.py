"""initial rack schema

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


def upgrade() -> None:
    op.create_table(
        "rack",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rack_code", sa.String(length=32), nullable=False),
        sa.Column("row_no", sa.Integer(), nullable=False),
        sa.Column("column_no", sa.Integer(), nullable=False),
        sa.Column("shelf_no", sa.Integer(), nullable=False),
        sa.Column("location_name", sa.String(length=64), nullable=True),
        sa.Column("occupied", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("occupied_by_model", sa.String(length=64), nullable=True),
        sa.Column("date_of_occupied", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_rack"),
        sa.UniqueConstraint("rack_code", "row_no", "column_no", "shelf_no", name="uq_rack_slot"),
        sa.CheckConstraint("status IN ('active','inactive')", name="ck_rack_status_allowed"),
        sa.CheckConstraint("row_no >= 1", name="ck_rack_row_no_positive"),
        sa.CheckConstraint("column_no >= 1", name="ck_rack_column_no_positive"),
        sa.CheckConstraint("shelf_no >= 1", name="ck_rack_shelf_no_positive"),
        sa.CheckConstraint(
            "occupied = false OR occupied_by_model IS NOT NULL",
            name="ck_rack_occupied_requires_model",
        ),
    )
    op.create_index("ix_rack_rack_code", "rack", ["rack_code"])
    op.create_index("ix_rack_occupied", "rack", ["occupied"])
    op.create_index("ix_rack_occupied_by_model", "rack", ["occupied_by_model"])
    op.create_index("ix_rack_date_of_occupied", "rack", ["date_of_occupied"])


def downgrade() -> None:
    op.drop_table("rack")
