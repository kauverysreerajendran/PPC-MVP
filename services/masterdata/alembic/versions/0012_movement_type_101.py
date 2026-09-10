"""sap_outwards only carries goods receipts — movement_type -> 101

Revision ID: 0012_movement_type_101
Revises: 0011_seed_boxes
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0012_movement_type_101"
down_revision: str | None = "0011_seed_boxes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE sap_outwards SET movement_type = '101'")


def downgrade() -> None:
    pass
