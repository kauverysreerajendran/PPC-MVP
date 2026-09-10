"""outward_status_master — lookup table for outward status values

Revision ID: 0015_outward_status_master
Revises: 0014_default_outward_status_new
Create Date: 2026-09-10
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015_outward_status_master"
down_revision: str | None = "0014_default_outward_status_new"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ROWS = [
    ("NEW", "Yet to Dispatch", 10, True, False),
    ("ALLOCATED", "Allocated", 20, False, False),
    ("PACKED", "Packed", 30, False, False),
    ("DISPATCHED", "Dispatched", 40, False, True),
    ("HOLD", "Hold", 50, False, False),
]


def upgrade() -> None:
    op.create_table(
        "outward_status_master",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("label", sa.String(length=64), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_dispatched", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="pk_outward_status_master"),
        sa.UniqueConstraint("code", name="uq_outward_status_master_code"),
        sa.CheckConstraint(
            "status IN ('active','inactive')", name="ck_outward_status_master_status_allowed"
        ),
    )
    op.bulk_insert(
        sa.table(
            "outward_status_master",
            sa.column("id", postgresql.UUID(as_uuid=True)),
            sa.column("code", sa.String),
            sa.column("label", sa.String),
            sa.column("sort_order", sa.Integer),
            sa.column("is_default", sa.Boolean),
            sa.column("is_dispatched", sa.Boolean),
        ),
        [
            {
                "id": uuid.uuid4(),
                "code": code,
                "label": label,
                "sort_order": order,
                "is_default": is_default,
                "is_dispatched": is_dispatched,
            }
            for code, label, order, is_default, is_dispatched in _ROWS
        ],
    )


def downgrade() -> None:
    op.drop_table("outward_status_master")
