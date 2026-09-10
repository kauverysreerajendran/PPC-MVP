"""seed 20 box UIDs (BUID-0001 .. BUID-0020)

Revision ID: 0011_seed_boxes
Revises: 0010_fill_tray_type_vendors
Create Date: 2026-09-10
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011_seed_boxes"
down_revision: str | None = "0010_fill_tray_type_vendors"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_BOX_UIDS = [f"BUID-{i:04d}" for i in range(1, 21)]


def upgrade() -> None:
    bind = op.get_bind()
    have = {
        r[0]
        for r in bind.execute(
            sa.text("SELECT box_uid FROM boxes WHERE box_uid = ANY(:v)"),
            {"v": _BOX_UIDS},
        ).all()
    }
    fresh = [
        {
            "id": uuid.uuid4(),
            "box_uid": buid,
            "box_type": "CARTON",
            "status": "active",
        }
        for buid in _BOX_UIDS
        if buid not in have
    ]
    if fresh:
        op.bulk_insert(
            sa.table(
                "boxes",
                sa.column("id", postgresql.UUID(as_uuid=True)),
                sa.column("box_uid", sa.String),
                sa.column("box_type", sa.String),
                sa.column("status", sa.String),
            ),
            fresh,
        )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM boxes WHERE box_uid = ANY(:v)"), {"v": _BOX_UIDS}
    )
