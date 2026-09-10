"""use real RACK-K model numbers on sap_outwards; drop the placeholder models

The SAP mock feed seeded fake model numbers (NH35A/NH38A/VK64/6R15/8215/F6922).
The real shop-floor model numbers come from the RACK-K chart (already in
``master_models`` via 0002). Remap the outward lines to real models and remove
the placeholders so the master holds real model numbers only.

Revision ID: 0016_real_model_numbers
Revises: 0015_outward_status_master
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0016_real_model_numbers"
down_revision: str | None = "0015_outward_status_master"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# placeholder -> real RACK-K model number (kept identical in the SAP service)
_REMAP = [
    ("8215", "90148"),
    ("VK64", "90102"),
    ("6R15", "90174"),
    ("NH38A", "90142"),
    ("NH35A", "90086"),
    ("F6922", "90127"),
]
_PLACEHOLDERS = tuple(fake for fake, _ in _REMAP)


def upgrade() -> None:
    for fake, real in _REMAP:
        op.execute(
            f"UPDATE sap_outwards SET model_no = '{real}' WHERE model_no = '{fake}'"
        )
    # re-point the FK to the real master row
    op.execute(
        "UPDATE sap_outwards o SET model_id = mm.id "
        "FROM master_models mm WHERE mm.model_no = o.model_no"
    )
    # remove the placeholder master rows (FK is ON DELETE SET NULL; already re-pointed)
    op.execute(
        "DELETE FROM master_models WHERE model_no IN "
        f"({', '.join(repr(p) for p in _PLACEHOLDERS)})"
    )


def downgrade() -> None:
    pass
