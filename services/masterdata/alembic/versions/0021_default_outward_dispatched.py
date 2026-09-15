"""SAP outward lines default to DISPATCHED ("Dispatched")

Lines arrive from SAP already dispatched, so "Dispatched" replaces "Yet to
Dispatch" as the starting outward status: the master's default flag moves to
DISPATCHED and every line still NEW (or without a status) becomes DISPATCHED.
What happens next (Received, Yet to verify, …) is recorded by the Status service.

Revision ID: 0021_default_outward_dispatched
Revises: 0020_merge_outward_satellites
Create Date: 2026-09-14
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0021_default_outward_dispatched"
down_revision: str | None = "0020_merge_outward_satellites"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE outward_status_master SET is_default = (code = 'DISPATCHED')")
    op.execute(
        "UPDATE sap_outwards SET outward_status = 'DISPATCHED' "
        "WHERE outward_status IS NULL OR outward_status = 'NEW'"
    )


def downgrade() -> None:
    # The default flag goes back; lines are left DISPATCHED — which of them were
    # NEW before is not recorded, so reverting them would invent data.
    op.execute("UPDATE outward_status_master SET is_default = (code = 'NEW')")
