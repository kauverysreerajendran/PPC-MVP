"""sap_outwards may only reference vendors that exist in the vendor master

Any sap_outwards row whose vendor_code is not a registered vendor has its
vendor_code / vendor_id cleared.

Revision ID: 0009_clean_non_master_vendors
Revises: 0008_case_trays
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0009_clean_non_master_vendors"
down_revision: str | None = "0008_case_trays"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE sap_outwards
        SET vendor_code = NULL, vendor_id = NULL
        WHERE vendor_code IS NOT NULL
          AND lower(vendor_code) NOT IN (SELECT lower(vendor_code) FROM vendors)
        """
    )


def downgrade() -> None:
    # data cleanup — not reversible
    pass
