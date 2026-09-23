"""outward lot quantities are whole even numbers

The companion to the SAP service's ``0005_even_whole_lot_quantities``: that one
repairs the feed, this one repairs the outward lines drawn from it, so the SAP
Outward grid and the feed cannot disagree about the same lot. Each service
migrates its own schema — masterdata never writes into ``sap`` and vice versa
(BLUEPRINT §0) — which is why the pair exists instead of one migration.

**What is left alone, and why.** Only ``quantity`` is rewritten, and only on
lines that came from the feed (``origin`` is not ``SHORTAGE``) and have nothing
received against them yet.

* ``received_qty`` / the per-scan accepted and rejected figures are receiving
  data — what a person counted off a pallet. Rounding those would falsify the
  count, so they are never touched.
* A shortage back-order's ``quantity`` is not a lot at all, it is a derived
  balance (lot - accepted - rejected), and its ``shortage_parent_*`` columns
  freeze the parent's figures at the moment it was raised. Rewriting either
  side would break ``lot - accepted - rejected = shortage``, so back-orders are
  skipped entirely.
* A line with receiving against it is skipped for the same reason: its lot qty
  is what the shortage on record was computed from.

That leaves exactly the rows where the lot is still only a statement of intent,
which is where an odd qty actually causes trouble — it cannot split into equal
front and back cases when the line is received.

Revision ID: 0025_even_whole_outward_quantities
Revises: 0024_shortage_parent_snapshot
Create Date: 2026-09-23
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0025_even_whole_outward_quantities"
down_revision: str | None = "0024_shortage_parent_snapshot"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

IS_EVEN_WHOLE = "quantity = trunc(quantity) AND (quantity::bigint) % 2 = 0"

TO_EVEN_WHOLE = (
    "CASE WHEN (round(quantity)::bigint) % 2 = 0"
    " THEN round(quantity)"
    " ELSE round(quantity) + 1 END"
)

#: lines whose lot qty is still only a statement of intent — see the docstring
SAFE_TO_ROUND = (
    "quantity IS NOT NULL"
    f" AND NOT ({IS_EVEN_WHOLE})"
    " AND (origin IS NULL OR origin <> 'SHORTAGE')"
    " AND received_pieces = 0"
    " AND inward_status IS NULL"
)


def upgrade() -> None:
    conn = op.get_bind()

    odd = conn.execute(
        sa.text(
            f"SELECT count(*) FROM sap_outwards"
            f" WHERE quantity IS NOT NULL AND NOT ({IS_EVEN_WHOLE})"
        )
    ).scalar_one()
    safe = conn.execute(
        sa.text(f"SELECT count(*) FROM sap_outwards WHERE {SAFE_TO_ROUND}")
    ).scalar_one()
    print(
        f"[0025] {odd} outward lot qty value(s) are not whole even numbers;"
        f" {safe} can be rewritten, {odd - safe} carry receiving or are"
        f" back-orders and are left as they are"
    )

    if safe:
        changed = conn.execute(
            sa.text(
                f"UPDATE sap_outwards SET quantity = {TO_EVEN_WHOLE},"
                f" updated_at = now() WHERE {SAFE_TO_ROUND}"
            )
        ).rowcount
        print(f"[0025] rewrote {changed} outward lot qty value(s)")

    after = conn.execute(
        sa.text(f"SELECT count(*) FROM sap_outwards WHERE {SAFE_TO_ROUND}")
    ).scalar_one()
    print(f"[0025] {after} rewritable row(s) left (expected 0)")


def downgrade() -> None:
    """No-op, deliberately — the original values are not recorded anywhere, and
    an odd lot qty was never a state the application could work with."""
