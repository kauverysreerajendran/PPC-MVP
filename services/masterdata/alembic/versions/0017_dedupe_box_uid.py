"""a Box UID may sit on only one outward line — clear the duplicates

Keeps the assignment on the DISPATCHED line (else the most recently updated),
clears `box_uid` on the rest and resets their status to NEW.

Revision ID: 0017_dedupe_box_uid
Revises: 0016_real_model_numbers
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0017_dedupe_box_uid"
down_revision: str | None = "0016_real_model_numbers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # rank rows sharing a box_uid; row 1 (dispatched first, then newest) keeps it
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY lower(box_uid)
                       ORDER BY (outward_status = 'DISPATCHED') DESC, updated_at DESC
                   ) AS rn
            FROM sap_outwards
            WHERE box_uid IS NOT NULL
        )
        UPDATE sap_outwards o
        SET box_uid = NULL,
            outward_status = 'NEW'
        FROM ranked r
        WHERE o.id = r.id AND r.rn > 1
        """
    )
    op.execute(
        """
        UPDATE sap_outward_statuses s
        SET status = 'NEW', note = 'reset: duplicate box uid cleared'
        FROM sap_outwards o
        WHERE s.sap_outward_id = o.id
          AND o.box_uid IS NULL
          AND o.outward_status = 'NEW'
          AND s.status = 'DISPATCHED'
        """
    )


def downgrade() -> None:
    pass
