"""front/back case tray types (cap 25) + per-lot tray counts on sap_outwards

- Trays master gets two tray-type spec rows: FRONTCASE and BACKCASE, each
  ``qty_capacity`` 25.
- sap_outwards gets ``front_case_trays`` / ``back_case_trays`` — how many
  25-piece case trays the lot needs on each side (ceil(quantity / 25)).

Revision ID: 0008_case_trays
Revises: 0007_sap_outward_txn_fields
Create Date: 2026-09-10
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_case_trays"
down_revision: str | None = "0007_sap_outward_txn_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CASE_TRAY_CAPACITY = 25


def upgrade() -> None:
    bind = op.get_bind()

    # --- tray master: FRONTCASE / BACKCASE type specs ---
    have = {
        r[0]
        for r in bind.execute(
            sa.text(
                "SELECT tray_id FROM trays WHERE tray_id IN ('FRONTCASE','BACKCASE')"
            )
        ).all()
    }
    fresh = [
        {
            "id": uuid.uuid4(),
            "tray_id": tid,
            "tray_type": tid,
            "no_of_trays": 1,
            "qty": 0,
            "qty_capacity": CASE_TRAY_CAPACITY,
            "status": "active",
        }
        for tid in ("FRONTCASE", "BACKCASE")
        if tid not in have
    ]
    if fresh:
        trays = sa.table(
            "trays",
            sa.column("id", postgresql.UUID(as_uuid=True)),
            sa.column("tray_id", sa.String),
            sa.column("tray_type", sa.String),
            sa.column("no_of_trays", sa.Integer),
            sa.column("qty", sa.Numeric),
            sa.column("qty_capacity", sa.Numeric),
            sa.column("status", sa.String),
        )
        op.bulk_insert(trays, fresh)

    # --- sap_outwards: per-lot case tray counts ---
    op.add_column("sap_outwards", sa.Column("front_case_trays", sa.Integer(), nullable=True))
    op.add_column("sap_outwards", sa.Column("back_case_trays", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_sap_outwards_case_trays_non_negative",
        "sap_outwards",
        "(front_case_trays IS NULL OR front_case_trays >= 0) AND "
        "(back_case_trays IS NULL OR back_case_trays >= 0)",
    )
    # backfill from quantity: ceil(quantity / 25) trays per side
    op.execute(
        f"""
        UPDATE sap_outwards
        SET front_case_trays = CEIL(quantity / {CASE_TRAY_CAPACITY}.0),
            back_case_trays  = CEIL(quantity / {CASE_TRAY_CAPACITY}.0),
            no_of_trays      = 2 * CEIL(quantity / {CASE_TRAY_CAPACITY}.0)
        WHERE quantity IS NOT NULL AND quantity > 0
        """
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_sap_outwards_case_trays_non_negative", "sap_outwards", type_="check"
    )
    op.drop_column("sap_outwards", "back_case_trays")
    op.drop_column("sap_outwards", "front_case_trays")
    op.execute("DELETE FROM trays WHERE tray_id IN ('FRONTCASE','BACKCASE')")
