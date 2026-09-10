"""default sap_outwards tray_type to 'FC + BC' and assign a master vendor to every row

Revision ID: 0010_fill_tray_type_vendors
Revises: 0009_clean_non_master_vendors
Create Date: 2026-09-10
"""
from __future__ import annotations

import random
import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_fill_tray_type_vendors"
down_revision: str | None = "0009_clean_non_master_vendors"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_VENDOR_CODES = ("KALAI-INDUSTRIES", "SHINE-TIMES")


def upgrade() -> None:
    bind = op.get_bind()

    # tray master: the combined FC + BC case tray (front 25 + back 25)
    if not bind.execute(
        sa.text("SELECT 1 FROM trays WHERE tray_id = 'FC+BC'")
    ).first():
        op.bulk_insert(
            sa.table(
                "trays",
                sa.column("id", postgresql.UUID(as_uuid=True)),
                sa.column("tray_id", sa.String),
                sa.column("tray_type", sa.String),
                sa.column("no_of_trays", sa.Integer),
                sa.column("qty", sa.Numeric),
                sa.column("qty_capacity", sa.Numeric),
                sa.column("status", sa.String),
            ),
            [
                {
                    "id": uuid.uuid4(),
                    "tray_id": "FC+BC",
                    "tray_type": "FC + BC",
                    "no_of_trays": 1,
                    "qty": 0,
                    "qty_capacity": 50,
                    "status": "active",
                }
            ],
        )

    op.execute("UPDATE sap_outwards SET tray_type = 'FC + BC' WHERE tray_type IS NULL")

    vendors = {
        code: vid
        for code, vid in bind.execute(
            sa.text(
                "SELECT vendor_code, id FROM vendors WHERE vendor_code = ANY(:c)"
            ),
            {"c": list(_VENDOR_CODES)},
        ).all()
    }
    if not vendors:
        return

    rng = random.Random(20260910)  # noqa: S311 - deterministic, not security
    refs = [
        r[0]
        for r in bind.execute(
            sa.text("SELECT sap_reference_id FROM sap_outwards WHERE vendor_id IS NULL")
        ).all()
    ]
    for ref in refs:
        code = rng.choice(list(vendors))
        bind.execute(
            sa.text(
                "UPDATE sap_outwards SET vendor_code = :vc, vendor_id = :vid "
                "WHERE sap_reference_id = :ref"
            ),
            {"vc": code, "vid": vendors[code], "ref": ref},
        )


def downgrade() -> None:
    op.execute("UPDATE sap_outwards SET tray_type = NULL WHERE tray_type = 'FC + BC'")
    op.execute("DELETE FROM trays WHERE tray_id = 'FC+BC'")
