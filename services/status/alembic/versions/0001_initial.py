"""status schema: status_definition (seeded), line_status, status_event

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-14
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STAGE_CHECK = "stage IN ('outward','inward','rack')"

#: (stage, code, label, tone, sort_order, is_initial)
DEFINITIONS = [
    ("outward", "DISPATCHED", "Dispatched", "success", 10, True),
    ("outward", "RECEIVED", "Received", "info", 20, False),
    ("inward", "NOT_RECEIVED", "Not received", "neutral", 10, True),
    ("inward", "YET_TO_VERIFY", "Yet to verify", "warning", 20, False),
    ("inward", "VERIFIED", "Verified", "success", 30, False),
    ("rack", "NOT_PLACED", "Not placed", "neutral", 10, True),
    ("rack", "PARTIALLY_PLACED", "Partially placed", "orange", 20, False),
    ("rack", "PLACED", "Placed", "success", 30, False),
]


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "status_definition",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stage", sa.String(length=16), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("label", sa.String(length=64), nullable=False),
        sa.Column("tone", sa.String(length=16), server_default="neutral", nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_initial", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_status_definition"),
        sa.UniqueConstraint("stage", "code", name="uq_status_definition_stage_code"),
        sa.CheckConstraint(_STAGE_CHECK, name="ck_status_definition_stage_allowed"),
        sa.CheckConstraint(
            "tone IN ('neutral','info','success','warning','orange','danger','progress')",
            name="ck_status_definition_tone_allowed",
        ),
        sa.CheckConstraint(
            "status IN ('active','inactive')", name="ck_status_definition_status_allowed"
        ),
    )

    op.create_table(
        "line_status",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sap_reference_id", sa.String(length=64), nullable=False),
        sa.Column("stage", sa.String(length=16), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("actor", sa.String(length=64), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_line_status"),
        sa.UniqueConstraint("sap_reference_id", "stage", name="uq_line_status_ref_stage"),
        sa.CheckConstraint(_STAGE_CHECK, name="ck_line_status_stage_allowed"),
    )
    op.create_index("ix_line_status_stage_code", "line_status", ["stage", "code"])

    op.create_table(
        "status_event",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sap_reference_id", sa.String(length=64), nullable=False),
        sa.Column("stage", sa.String(length=16), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("previous_code", sa.String(length=32), nullable=True),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("actor", sa.String(length=64), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.Column(
            "occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="pk_status_event"),
        sa.CheckConstraint(_STAGE_CHECK, name="ck_status_event_stage_allowed"),
    )
    op.create_index("ix_status_event_sap_reference_id", "status_event", ["sap_reference_id"])
    op.create_index("ix_status_event_occurred_at", "status_event", ["occurred_at"])

    op.bulk_insert(
        sa.table(
            "status_definition",
            sa.column("id", postgresql.UUID(as_uuid=True)),
            sa.column("stage", sa.String),
            sa.column("code", sa.String),
            sa.column("label", sa.String),
            sa.column("tone", sa.String),
            sa.column("sort_order", sa.Integer),
            sa.column("is_initial", sa.Boolean),
        ),
        [
            {
                "id": uuid.uuid4(),
                "stage": stage,
                "code": code,
                "label": label,
                "tone": tone,
                "sort_order": order,
                "is_initial": initial,
            }
            for stage, code, label, tone, order, initial in DEFINITIONS
        ],
    )


def downgrade() -> None:
    op.drop_table("status_event")
    op.drop_table("line_status")
    op.drop_table("status_definition")
