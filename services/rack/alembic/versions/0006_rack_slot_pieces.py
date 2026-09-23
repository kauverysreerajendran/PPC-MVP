"""rack.pieces — how many received pieces a tray holds

A tray used to hold exactly one received piece, so counting a line's placed
stock meant counting trays. A tray now holds up to ``DEFAULT_TRAY_CAPACITY_PIECES``
pieces (``app/capacity.py``), so the count has to live on the row. Existing
occupied receiving rows are backfilled with 1 — one piece per tray, which is
what they meant when they were written. Allocation rows stay NULL.

Revision ID: 0006_rack_slot_pieces
Revises: 0005_rack_placement_source
Create Date: 2026-09-21
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_rack_slot_pieces"
down_revision: str | None = "0005_rack_placement_source"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("rack", sa.Column("pieces", sa.Integer(), nullable=True))
    op.create_check_constraint("ck_rack_pieces_positive", "rack", "pieces IS NULL OR pieces >= 1")
    op.execute(
        sa.text(
            "UPDATE rack SET pieces = 1"
            " WHERE placement_source = 'receiving' AND occupied = true"
        )
    )


def downgrade() -> None:
    op.drop_constraint("ck_rack_pieces_positive", "rack", type_="check")
    op.drop_column("rack", "pieces")
