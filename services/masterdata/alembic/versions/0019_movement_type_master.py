"""movement_type_master — lookup table for SAP movement-type codes

Revision ID: 0019_movement_type_master
Revises: 0018_sap_inward_receiving
Create Date: 2026-09-11
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019_movement_type_master"
down_revision: str | None = "0018_sap_inward_receiving"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ROWS = [
    ("101", "Goods receipt against a purchase order", 10),
    ("102", "Reversal of goods receipt for a purchase order", 20),
    ("103", "Goods receipt into GR blocked stock", 30),
    ("105", "Release from GR blocked stock to unrestricted", 40),
    ("122", "Return delivery to vendor", 50),
    ("123", "Reversal of return delivery to vendor", 60),
    ("201", "Goods issue to a cost center", 70),
    ("261", "Goods issue to a production order", 80),
    ("262", "Reversal of goods issue to a production order", 90),
    ("301", "Plant-to-plant transfer posting", 100),
    ("311", "Storage-location transfer posting", 110),
    ("321", "Transfer from quality inspection to unrestricted stock", 120),
    ("501", "Goods receipt without a purchase order", 130),
    ("601", "Goods issue for a delivery", 140),
    ("641", "Transfer posting to stock in transit", 150),
]


def upgrade() -> None:
    op.create_table(
        "movement_type_master",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="pk_movement_type_master"),
        sa.UniqueConstraint("code", name="uq_movement_type_master_code"),
        sa.CheckConstraint(
            "status IN ('active','inactive')", name="ck_movement_type_master_status_allowed"
        ),
    )
    op.bulk_insert(
        sa.table(
            "movement_type_master",
            sa.column("id", postgresql.UUID(as_uuid=True)),
            sa.column("code", sa.String),
            sa.column("description", sa.String),
            sa.column("sort_order", sa.Integer),
        ),
        [
            {"id": uuid.uuid4(), "code": code, "description": description, "sort_order": order}
            for code, description, order in _ROWS
        ],
    )


def downgrade() -> None:
    op.drop_table("movement_type_master")
