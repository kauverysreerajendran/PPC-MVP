"""tray-level lot storage: qty / lot_no / sap_reference_id

Adds the columns the SAP-outward allocator writes when it places a lot into
physical trays:

  * ``qty``               — this tray's slice of the lot quantity (a lot is
                            split across many trays)
  * ``lot_no``            — the SAP lot number the tray holds
  * ``sap_reference_id``  — the SAP outward document; also the allocator's
                            idempotency key (a document is never placed twice)

No data change — allocation is driven at runtime by
``POST /api/v1/rack/allocate`` against the live Masterdata ``sap_outwards`` feed.

Revision ID: 0004_rack_qty_lot
Revises: 0003_rack_topology_master
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_rack_qty_lot"
down_revision: str | None = "0003_rack_topology_master"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("rack", sa.Column("qty", sa.Numeric(18, 3), nullable=True))
    op.add_column("rack", sa.Column("lot_no", sa.String(length=64), nullable=True))
    op.add_column(
        "rack", sa.Column("sap_reference_id", sa.String(length=64), nullable=True)
    )
    op.create_index("ix_rack_lot_no", "rack", ["lot_no"])
    op.create_index("ix_rack_sap_reference_id", "rack", ["sap_reference_id"])


def downgrade() -> None:
    op.drop_index("ix_rack_sap_reference_id", table_name="rack")
    op.drop_index("ix_rack_lot_no", table_name="rack")
    op.drop_column("rack", "sap_reference_id")
    op.drop_column("rack", "lot_no")
    op.drop_column("rack", "qty")
