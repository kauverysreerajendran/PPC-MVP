"""lot quantities are whole even numbers

A lot is split down the middle into front and back cases, so a lot qty that is
not a whole even number can never divide equally. The edit endpoint has refused
one for a while and the mock provider only ever generates even numbers
(``randrange(26, 500, 2)``), but rows written before either was true can still
carry an odd or fractional qty. This rewrites them to the nearest even whole
number, ties rounding up (467 -> 468, 353.4 -> 354, 468 unchanged), and leaves
NULL as NULL. ``app/lotqty.py`` states the same rule for the ingest path.

Only ``quantity`` — the lot as SAP stated it — is touched. Nothing here writes
to another service's schema: the matching outward lines are repaired by the
masterdata service's own revision, ``0025_even_whole_outward_quantities``.

Revision ID: 0005_even_whole_lot_quantities
Revises: 0004_master_vendors
Create Date: 2026-09-23
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_even_whole_lot_quantities"
down_revision: str | None = "0004_master_vendors"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: a qty that is already a whole even number needs nothing doing to it
IS_EVEN_WHOLE = "quantity = trunc(quantity) AND (quantity::bigint) % 2 = 0"

#: nearest whole number (ties up), then up again if that lands on an odd one
TO_EVEN_WHOLE = (
    "CASE WHEN (round(quantity)::bigint) % 2 = 0"
    " THEN round(quantity)"
    " ELSE round(quantity) + 1 END"
)


def upgrade() -> None:
    conn = op.get_bind()
    where = f"quantity IS NOT NULL AND NOT ({IS_EVEN_WHOLE})"

    before = conn.execute(
        sa.text(f"SELECT count(*) FROM sap_inward_record WHERE {where}")
    ).scalar_one()
    total = conn.execute(sa.text("SELECT count(*) FROM sap_inward_record")).scalar_one()
    print(f"[0005] {before} of {total} lot qty value(s) are not whole even numbers")

    if before:
        changed = conn.execute(
            sa.text(
                f"UPDATE sap_inward_record SET quantity = {TO_EVEN_WHOLE},"
                f" updated_at = now() WHERE {where}"
            )
        ).rowcount
        print(f"[0005] rewrote {changed} lot qty value(s) to the nearest even whole number")

    after = conn.execute(
        sa.text(f"SELECT count(*) FROM sap_inward_record WHERE {where}")
    ).scalar_one()
    print(f"[0005] {after} left (expected 0)")


def downgrade() -> None:
    """No-op, deliberately.

    The original values are not recorded anywhere, and an odd lot qty was never
    a state the application could work with — putting one back would only
    restore a row the edit endpoint already refuses to save.
    """
