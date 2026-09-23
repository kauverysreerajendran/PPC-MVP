"""shortage back-orders: provenance columns + the PENDING outward status

A receiving entry on SAP Inward that leaves a shortage
(``lot - accepted - rejected > 0``) raises a NEW outward line for the balance,
so it can be dispatched again. The new line needs two things this revision adds:

  * ``parent_sap_reference_id`` / ``origin`` — where the line came from. Both
    are nullable, so every line already in the table is unaffected; the ones
    that came from the SAP feed are backfilled to ``origin = 'SAP'``.
  * the outward status ``PENDING`` ("Pending") — widened on the
    ``outward_status_allowed`` CHECK and added to the outward-status master, so
    the chip label is read from the master like every other status.

Revision ID: 0023_shortage_backorders
Revises: 0022_default_outward_yet_to_dispatch
Create Date: 2026-09-21
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0023_shortage_backorders"
down_revision: str | None = "0022_default_outward_yet_to_dispatch"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_STATUSES = "('NEW','ALLOCATED','PACKED','DISPATCHED','HOLD')"
_NEW_STATUSES = "('NEW','ALLOCATED','PACKED','DISPATCHED','HOLD','PENDING')"
_CHECK = "ck_sap_outwards_outward_status_allowed"


def upgrade() -> None:
    op.add_column(
        "sap_outwards",
        sa.Column("parent_sap_reference_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "sap_outwards",
        sa.Column("origin", sa.String(length=16), server_default="SAP", nullable=True),
    )
    op.create_index(
        "ix_sap_outwards_parent_sap_reference_id",
        "sap_outwards",
        ["parent_sap_reference_id"],
    )
    # Existing lines all came from the SAP feed.
    op.execute("UPDATE sap_outwards SET origin = 'SAP' WHERE origin IS NULL")

    op.drop_constraint(_CHECK, "sap_outwards", type_="check")
    op.create_check_constraint(
        _CHECK, "sap_outwards", f"outward_status IS NULL OR outward_status IN {_NEW_STATUSES}"
    )

    # The chip label comes from the master, never from the code itself.
    op.bulk_insert(
        sa.table(
            "outward_status_master",
            sa.column("id", postgresql.UUID(as_uuid=True)),
            sa.column("code", sa.String),
            sa.column("label", sa.String),
            sa.column("sort_order", sa.Integer),
            sa.column("is_default", sa.Boolean),
            sa.column("is_dispatched", sa.Boolean),
        ),
        [
            {
                "id": uuid.uuid4(),
                "code": "PENDING",
                "label": "Pending",
                # between "Yet to Dispatch" (10) and "Allocated" (20): a
                # back-order is the very start of an outward line's life.
                "sort_order": 15,
                "is_default": False,
                "is_dispatched": False,
            }
        ],
    )


def downgrade() -> None:
    op.execute("DELETE FROM outward_status_master WHERE code = 'PENDING'")
    # Nothing may be left in a status the CHECK is about to forbid.
    op.execute("UPDATE sap_outwards SET outward_status = 'NEW' WHERE outward_status = 'PENDING'")
    op.drop_constraint(_CHECK, "sap_outwards", type_="check")
    op.create_check_constraint(
        _CHECK, "sap_outwards", f"outward_status IS NULL OR outward_status IN {_OLD_STATUSES}"
    )
    op.drop_index("ix_sap_outwards_parent_sap_reference_id", "sap_outwards")
    op.drop_column("sap_outwards", "origin")
    op.drop_column("sap_outwards", "parent_sap_reference_id")
