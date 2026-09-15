"""rack.placement_source — tell received-piece placements from the outward allocation

Received pieces placed from SAP Inward (``POST /place``) are marked "receiving",
so counting what a line has in racks — and resetting the outward allocation —
never mixes the two. Existing rows stay NULL (= allocation).

Revision ID: 0005_rack_placement_source
Revises: 0004_rack_qty_lot
Create Date: 2026-09-14
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_rack_placement_source"
down_revision: str | None = "0004_rack_qty_lot"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("rack", sa.Column("placement_source", sa.String(length=16), nullable=True))
    op.create_check_constraint(
        "ck_rack_placement_source_allowed",
        "rack",
        "placement_source IS NULL OR placement_source IN ('allocation','receiving')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_rack_placement_source_allowed", "rack", type_="check")
    op.drop_column("rack", "placement_source")
