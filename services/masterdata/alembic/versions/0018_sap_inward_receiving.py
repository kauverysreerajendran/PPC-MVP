"""SAP inward (receiving) — per-line tally + scan log

Adds the columns the SAP Inward screen writes when an operator scans received
pieces against an outward line, plus ``sap_inward_scans`` (one row per scanned
front+back piece).

Revision ID: 0018_sap_inward_receiving
Revises: 0017_dedupe_box_uid
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018_sap_inward_receiving"
down_revision: str | None = "0017_dedupe_box_uid"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sap_outwards",
        sa.Column(
            "received_pieces",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "sap_outwards", sa.Column("received_qty", sa.Numeric(18, 3), nullable=True)
    )
    op.add_column(
        "sap_outwards", sa.Column("inward_status", sa.String(length=16), nullable=True)
    )
    op.add_column(
        "sap_outwards",
        sa.Column("inward_last_scan_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_sap_outwards_inward_status", "sap_outwards", ["inward_status"]
    )
    op.create_check_constraint(
        "ck_sap_outwards_inward_status_allowed",
        "sap_outwards",
        "inward_status IS NULL OR inward_status IN "
        "('PENDING','PARTIAL','RECEIVED','SHORT','OVER')",
    )
    op.create_check_constraint(
        "ck_sap_outwards_received_pieces_non_negative",
        "sap_outwards",
        "received_pieces >= 0",
    )

    op.create_table(
        "sap_inward_scans",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sap_outward_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("box_uid", sa.String(length=128), nullable=True),
        sa.Column("po_no", sa.String(length=64), nullable=True),
        sa.Column("dc_no", sa.String(length=64), nullable=True),
        sa.Column("piece_no", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Numeric(18, 3), nullable=True),
        sa.Column("scanned_by", sa.String(length=64), nullable=True),
        sa.Column("scanned_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_sap_inward_scans"),
        sa.ForeignKeyConstraint(
            ["sap_outward_id"],
            ["sap_outwards.id"],
            name="fk_sap_inward_scans_sap_outward_id_sap_outwards",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "sap_outward_id", "piece_no", name="uq_sap_inward_scans_piece"
        ),
        sa.CheckConstraint("piece_no >= 1", name="ck_sap_inward_scans_piece_no_positive"),
    )
    op.create_index(
        "ix_sap_inward_scans_sap_outward_id", "sap_inward_scans", ["sap_outward_id"]
    )
    op.create_index("ix_sap_inward_scans_box_uid", "sap_inward_scans", ["box_uid"])


def downgrade() -> None:
    op.drop_table("sap_inward_scans")
    op.drop_constraint(
        "ck_sap_outwards_received_pieces_non_negative", "sap_outwards", type_="check"
    )
    op.drop_constraint(
        "ck_sap_outwards_inward_status_allowed", "sap_outwards", type_="check"
    )
    op.drop_index("ix_sap_outwards_inward_status", table_name="sap_outwards")
    op.drop_column("sap_outwards", "inward_last_scan_at")
    op.drop_column("sap_outwards", "inward_status")
    op.drop_column("sap_outwards", "received_qty")
    op.drop_column("sap_outwards", "received_pieces")
