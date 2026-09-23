"""remap the placeholder feed vendors onto the real vendor master

The seeded/mock feed used to invent its own vendors (V1001-V1004). Those codes
are not in the masterdata vendor master, so the Vendor column rendered
"not in master". Every row is moved onto one of the two registered vendors,
keeping the alternating spread the seed had.

Revision ID: 0004_master_vendors
Revises: 0003_real_model_numbers
Create Date: 2026-09-20
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_master_vendors"
down_revision: str | None = "0003_real_model_numbers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: old placeholder code -> (master vendor_code, master vendor_name)
_REMAP: dict[str, tuple[str, str]] = {
    "V1001": ("KALAI-INDUSTRIES", "Kalai Industries"),
    "V1003": ("KALAI-INDUSTRIES", "Kalai Industries"),
    "V1002": ("SHINE-TIMES", "Shine Times"),
    "V1004": ("SHINE-TIMES", "Shine Times"),
}


def upgrade() -> None:
    bind = op.get_bind()
    for old, (code, name) in _REMAP.items():
        bind.execute(
            sa.text(
                "UPDATE sap_inward_record SET vendor_code = :code, vendor_name = :name "
                "WHERE vendor_code = :old"
            ),
            {"code": code, "name": name, "old": old},
        )


def downgrade() -> None:
    # data cleanup - the original placeholder codes are not recoverable
    pass
