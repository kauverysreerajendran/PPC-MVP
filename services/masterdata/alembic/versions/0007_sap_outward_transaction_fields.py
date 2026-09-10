"""sap_outwards transaction fields: tray_type, no_of_trays, outward_status

Revision ID: 0007_sap_outward_txn_fields
Revises: 0006_trim_outwards_and_vendors
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_sap_outward_txn_fields"
down_revision: str | None = "0006_trim_outwards_and_vendors"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUSES = "('NEW','ALLOCATED','PACKED','DISPATCHED','HOLD')"


def upgrade() -> None:
    op.add_column("sap_outwards", sa.Column("tray_type", sa.String(length=32), nullable=True))
    op.add_column("sap_outwards", sa.Column("no_of_trays", sa.Integer(), nullable=True))
    op.add_column("sap_outwards", sa.Column("outward_status", sa.String(length=16), nullable=True))
    op.create_check_constraint(
        "ck_sap_outwards_outward_status_allowed",
        "sap_outwards",
        f"outward_status IS NULL OR outward_status IN {_STATUSES}",
    )
    op.create_check_constraint(
        "ck_sap_outwards_no_of_trays_positive",
        "sap_outwards",
        "no_of_trays IS NULL OR no_of_trays >= 1",
    )
    op.create_index("ix_sap_outwards_outward_status", "sap_outwards", ["outward_status"])
    op.create_index("ix_sap_outwards_tray_type", "sap_outwards", ["tray_type"])


def downgrade() -> None:
    op.drop_index("ix_sap_outwards_tray_type", "sap_outwards")
    op.drop_index("ix_sap_outwards_outward_status", "sap_outwards")
    op.drop_constraint("ck_sap_outwards_no_of_trays_positive", "sap_outwards", type_="check")
    op.drop_constraint("ck_sap_outwards_outward_status_allowed", "sap_outwards", type_="check")
    op.drop_column("sap_outwards", "outward_status")
    op.drop_column("sap_outwards", "no_of_trays")
    op.drop_column("sap_outwards", "tray_type")
