"""shortage back-orders: freeze the parent's quantity trail on the new line

A back-order raised by SAP Inward carries only the shortage as its own lot qty.
On its own that number is unaccountable — hovering the DC / PO of such a line
shows "240" with nothing to say where 240 came from.

This revision adds four nullable audit columns that snapshot the parent line's
figures at the moment the back-order is raised, so the trail
(lot 300 → accepted 60 / rejected 0 → received 60 → pending 240) can be
rendered without a second fetch and stays truthful even if the parent is later
reset or received again. Every existing line keeps NULL in all four.

Revision ID: 0024_shortage_parent_snapshot
Revises: 0023_shortage_backorders
Create Date: 2026-09-21
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024_shortage_parent_snapshot"
down_revision: str | None = "0023_shortage_backorders"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = (
    "shortage_parent_lot_qty",
    "shortage_parent_accepted_qty",
    "shortage_parent_rejected_qty",
    "shortage_parent_received_qty",
)


def upgrade() -> None:
    for name in _COLUMNS:
        op.add_column(
            "sap_outwards", sa.Column(name, sa.Numeric(18, 3), nullable=True)
        )


def downgrade() -> None:
    for name in reversed(_COLUMNS):
        op.drop_column("sap_outwards", name)
