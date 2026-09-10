"""sap_outward_statuses — authoritative per-line outward status table

Revision ID: 0013_sap_outward_statuses
Revises: 0012_movement_type_101
Create Date: 2026-09-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013_sap_outward_statuses"
down_revision: str | None = "0012_movement_type_101"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUSES = "('NEW','ALLOCATED','PACKED','DISPATCHED','HOLD')"


def upgrade() -> None:
    op.create_table(
        "sap_outward_statuses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sap_outward_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sap_outward_statuses"),
        sa.ForeignKeyConstraint(
            ["sap_outward_id"],
            ["sap_outwards.id"],
            name="fk_sap_outward_statuses_sap_outward_id_sap_outwards",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "sap_outward_id", name="uq_sap_outward_statuses_sap_outward_id"
        ),
        sa.CheckConstraint(f"status IN {_STATUSES}", name="ck_sap_outward_statuses_status_allowed"),
    )
    op.create_index(
        "ix_sap_outward_statuses_sap_outward_id",
        "sap_outward_statuses",
        ["sap_outward_id"],
    )
    op.create_index(
        "ix_sap_outward_statuses_status", "sap_outward_statuses", ["status"]
    )

    # Backfill from the existing denormalised column.
    op.execute(
        """
        INSERT INTO sap_outward_statuses (id, sap_outward_id, status, created_at, updated_at)
        SELECT gen_random_uuid(), id, outward_status, now(), now()
        FROM sap_outwards
        WHERE outward_status IS NOT NULL
        """
    )

    # Any line that already carries a valid, available Box UID is dispatched.
    op.execute(
        """
        UPDATE sap_outwards o
        SET outward_status = 'DISPATCHED'
        FROM boxes b
        WHERE o.box_uid IS NOT NULL
          AND lower(b.box_uid) = lower(o.box_uid)
          AND b.status = 'active'
          AND (o.outward_status IS DISTINCT FROM 'DISPATCHED')
        """
    )
    op.execute(
        """
        INSERT INTO sap_outward_statuses (id, sap_outward_id, status, note, created_at, updated_at)
        SELECT gen_random_uuid(), o.id, 'DISPATCHED', 'auto: box uid entered', now(), now()
        FROM sap_outwards o
        JOIN boxes b ON lower(b.box_uid) = lower(o.box_uid) AND b.status = 'active'
        WHERE o.box_uid IS NOT NULL
        ON CONFLICT (sap_outward_id)
        DO UPDATE SET status = 'DISPATCHED', note = 'auto: box uid entered', updated_at = now()
        """
    )


def downgrade() -> None:
    op.drop_index("ix_sap_outward_statuses_status", "sap_outward_statuses")
    op.drop_index("ix_sap_outward_statuses_sap_outward_id", "sap_outward_statuses")
    op.drop_table("sap_outward_statuses")
