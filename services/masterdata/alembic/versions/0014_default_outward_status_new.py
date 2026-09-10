"""every sap_outwards line gets a status row (default NEW = "Yet to Dispatch")

Revision ID: 0014_default_outward_status_new
Revises: 0013_sap_outward_statuses
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0014_default_outward_status_new"
down_revision: str | None = "0013_sap_outward_statuses"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Denormalised column: no line stays without a status.
    op.execute("UPDATE sap_outwards SET outward_status = 'NEW' WHERE outward_status IS NULL")

    # Authoritative table: one row per line, mirrored from the column.
    op.execute(
        """
        INSERT INTO sap_outward_statuses (id, sap_outward_id, status, created_at, updated_at)
        SELECT gen_random_uuid(), o.id, o.outward_status, now(), now()
        FROM sap_outwards o
        LEFT JOIN sap_outward_statuses st ON st.sap_outward_id = o.id
        WHERE st.id IS NULL
        """
    )


def downgrade() -> None:
    # Non-destructive: leave the backfilled status rows in place.
    pass
