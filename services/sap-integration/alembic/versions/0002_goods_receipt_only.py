"""this flow only handles goods receipts — normalise movement_type to 101

Revision ID: 0002_goods_receipt_only
Revises: 0001_initial
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002_goods_receipt_only"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE sap_inward_record SET movement_type = '101'")


def downgrade() -> None:
    pass
