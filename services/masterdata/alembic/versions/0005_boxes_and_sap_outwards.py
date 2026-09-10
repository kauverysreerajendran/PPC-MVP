"""boxes master; rename sap_inwards -> sap_outwards; drop descriptions;
add box_uid + tray_id; FKs ON DELETE SET NULL

Revision ID: 0005_boxes_and_sap_outwards
Revises: 0004_trays
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_boxes_and_sap_outwards"
down_revision: str | None = "0004_trays"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FKS = {
    "model_id": ("master_models", "id"),
    "vendor_id": ("vendors", "id"),
    "plating_color_id": ("plating_colors", "id"),
    "location_id": ("locations", "id"),
}
_IX_COLS = [
    "transaction_date", "sap_document_no", "po_no", "material_no",
    "model_id", "vendor_id", "plating_color_id", "location_id",
]


def upgrade() -> None:
    # --- boxes master ---
    op.create_table(
        "boxes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("box_uid", sa.String(length=128), nullable=False),
        sa.Column("box_type", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_boxes"),
        sa.UniqueConstraint("box_uid", name="uq_boxes_box_uid"),
        sa.CheckConstraint("status IN ('active','inactive')", name="ck_boxes_status_allowed"),
    )
    op.create_index("ix_boxes_box_type", "boxes", ["box_type"])

    # --- trays: drop description ---
    op.drop_column("trays", "description")

    # --- rename sap_inwards -> sap_outwards ---
    op.rename_table("sap_inwards", "sap_outwards")
    op.execute("ALTER TABLE sap_outwards RENAME CONSTRAINT pk_sap_inwards TO pk_sap_outwards")
    op.execute(
        "ALTER TABLE sap_outwards RENAME CONSTRAINT uq_sap_inwards_sap_reference_id "
        "TO uq_sap_outwards_sap_reference_id"
    )
    # 0001 stored these with a doubled prefix via the metadata naming convention
    op.execute(
        "ALTER TABLE sap_outwards RENAME CONSTRAINT "
        "ck_sap_inwards_ck_sap_inwards_status_allowed TO ck_sap_outwards_status_allowed"
    )
    op.execute(
        "ALTER TABLE sap_outwards RENAME CONSTRAINT "
        "ck_sap_inwards_ck_sap_inwards_quantity_non_negative "
        "TO ck_sap_outwards_quantity_non_negative"
    )
    for col in _IX_COLS:
        op.execute(f"ALTER INDEX ix_sap_inwards_{col} RENAME TO ix_sap_outwards_{col}")

    # --- drop material_description ---
    op.drop_column("sap_outwards", "material_description")

    # --- add box_uid + tray_id ---
    op.add_column("sap_outwards", sa.Column("box_uid", sa.String(length=128), nullable=True))
    op.add_column("sap_outwards", sa.Column("tray_id", sa.String(length=64), nullable=True))
    op.create_index("ix_sap_outwards_box_uid", "sap_outwards", ["box_uid"])
    op.create_index("ix_sap_outwards_tray_id", "sap_outwards", ["tray_id"])

    # --- FKs: RESTRICT -> SET NULL ---
    for col, (ref_table, ref_col) in _FKS.items():
        op.drop_constraint(f"fk_sap_inwards_{col}_{ref_table}", "sap_outwards", type_="foreignkey")
        op.create_foreign_key(
            f"fk_sap_outwards_{col}_{ref_table}",
            "sap_outwards",
            ref_table,
            [col],
            [ref_col],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    for col, (ref_table, ref_col) in _FKS.items():
        op.drop_constraint(f"fk_sap_outwards_{col}_{ref_table}", "sap_outwards", type_="foreignkey")
        op.create_foreign_key(
            f"fk_sap_inwards_{col}_{ref_table}",
            "sap_outwards",
            ref_table,
            [col],
            [ref_col],
            ondelete="RESTRICT",
        )
    op.drop_index("ix_sap_outwards_tray_id", "sap_outwards")
    op.drop_index("ix_sap_outwards_box_uid", "sap_outwards")
    op.drop_column("sap_outwards", "tray_id")
    op.drop_column("sap_outwards", "box_uid")
    op.add_column("sap_outwards", sa.Column("material_description", sa.Text(), nullable=True))
    for col in _IX_COLS:
        op.execute(f"ALTER INDEX ix_sap_outwards_{col} RENAME TO ix_sap_inwards_{col}")
    op.execute("ALTER TABLE sap_outwards RENAME CONSTRAINT ck_sap_outwards_quantity_non_negative TO ck_sap_inwards_ck_sap_inwards_quantity_non_negative")
    op.execute("ALTER TABLE sap_outwards RENAME CONSTRAINT ck_sap_outwards_status_allowed TO ck_sap_inwards_ck_sap_inwards_status_allowed")
    op.execute("ALTER TABLE sap_outwards RENAME CONSTRAINT uq_sap_outwards_sap_reference_id TO uq_sap_inwards_sap_reference_id")
    op.execute("ALTER TABLE sap_outwards RENAME CONSTRAINT pk_sap_outwards TO pk_sap_inwards")
    op.rename_table("sap_outwards", "sap_inwards")
    op.add_column("trays", sa.Column("description", sa.Text(), nullable=True))
    op.drop_index("ix_boxes_box_type", "boxes")
    op.drop_table("boxes")
