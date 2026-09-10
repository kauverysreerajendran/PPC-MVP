"""keep only 5 sap_outwards rows; keep only the Shine Times / Kalai vendors

Revision ID: 0006_trim_outwards_and_vendors
Revises: 0005_boxes_and_sap_outwards
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0006_trim_outwards_and_vendors"
down_revision: str | None = "0005_boxes_and_sap_outwards"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # keep the 5 most recent outward rows, drop the rest
    op.execute(
        """
        DELETE FROM sap_outwards
        WHERE id NOT IN (
            SELECT id FROM sap_outwards
            ORDER BY transaction_date DESC, sap_reference_id DESC
            LIMIT 5
        )
        """
    )
    # keep only the two business vendors; FKs are ON DELETE SET NULL so any
    # remaining sap_outwards.vendor_id pointing at a removed vendor is nulled
    op.execute(
        "DELETE FROM vendors WHERE vendor_code NOT IN ('SHINE-TIMES','KALAI-INDUSTRIES')"
    )


def downgrade() -> None:
    # data trim is not reversible
    pass
