"""outward stage: the PENDING status

SAP Inward raises a new outward line for the balance a receiving entry did not
account for (the shortage). That line has not been dispatched, so it needs a
status of its own at the outward stage — "Pending" — which keeps it on SAP
Outward's Main Table (the split there is "DISPATCHED / RECEIVED, or not").

Revision ID: 0002_outward_pending
Revises: 0001_initial
Create Date: 2026-09-21
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002_outward_pending"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: (stage, code, label, tone, sort_order, is_initial) — same shape as 0001, so
#: the contract test can union every revision's definitions.
#: sort_order 5 puts it before DISPATCHED (10): still to be dispatched.
DEFINITIONS = [("outward", "PENDING", "Pending", "warning", 5, False)]


def upgrade() -> None:
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
    op.execute("DELETE FROM status_definition WHERE stage = 'outward' AND code = 'PENDING'")
