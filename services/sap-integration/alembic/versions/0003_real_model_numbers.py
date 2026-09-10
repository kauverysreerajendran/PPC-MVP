"""remap placeholder model numbers to real RACK-K model numbers

Revision ID: 0003_real_model_numbers
Revises: 0002_goods_receipt_only
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0003_real_model_numbers"
down_revision: str | None = "0002_goods_receipt_only"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# placeholder -> real RACK-K model number (must match masterdata 0016)
_REMAP = [
    ("8215", "90148"),
    ("VK64", "90102"),
    ("6R15", "90174"),
    ("NH38A", "90142"),
    ("NH35A", "90086"),
    ("F6922", "90127"),
]


def upgrade() -> None:
    for fake, real in _REMAP:
        op.execute(
            "UPDATE sap_inward_record "
            f"SET model_no = '{real}', "
            f"    material_description = '{real} movement sub-assembly, semi-finished' "
            f"WHERE model_no = '{fake}'"
        )


def downgrade() -> None:
    pass
