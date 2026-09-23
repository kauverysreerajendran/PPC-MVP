"""SAP outward lines start NEW ("Yet to Dispatch") again

Revision 0021 made DISPATCHED the starting status, on the reading that lines
arrive from SAP already dispatched. Dispatch is now what the operator records on
SAP Outward — scanning a Box UID against the line — and that is what splits the
screen into its Main Table (still to dispatch) and Complete Table (dispatched,
and later received). Starting every line DISPATCHED would put them all in the
Complete Table from day one, so the default goes back to NEW.

Lines that already carry a Box UID were genuinely dispatched and keep their
status; the ones left DISPATCHED by 0021 without a box never were, so they go
back to NEW.

Revision ID: 0022_default_outward_yet_to_dispatch
Revises: 0021_default_outward_dispatched
Create Date: 2026-09-20
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0022_default_outward_yet_to_dispatch"
down_revision: str | None = "0021_default_outward_dispatched"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE outward_status_master SET is_default = (code = 'NEW')")
    op.execute(
        "UPDATE sap_outwards SET outward_status = 'NEW' "
        "WHERE box_uid IS NULL AND (outward_status IS NULL OR outward_status = 'DISPATCHED')"
    )


def downgrade() -> None:
    op.execute("UPDATE outward_status_master SET is_default = (code = 'DISPATCHED')")
    op.execute(
        "UPDATE sap_outwards SET outward_status = 'DISPATCHED' "
        "WHERE outward_status IS NULL OR outward_status = 'NEW'"
    )
