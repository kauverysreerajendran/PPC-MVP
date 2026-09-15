"""Fold sap_outward_statuses and sap_inward_scans into sap_outwards.

`sap_outwards` becomes one self-contained table:

  * ``sap_outward_statuses`` was strictly 1:1 (UNIQUE on ``sap_outward_id``) and
    its ``status`` was already mirrored onto ``sap_outwards.outward_status`` —
    verified before this migration was written: 15 status rows for 15 outward
    rows, 0 disagreements. Only ``note`` carried information the parent lacked,
    so it becomes the ``outward_status_note`` column.

  * ``sap_inward_scans`` was 1:N — one row per physically scanned piece. It
    becomes the ``inward_scans`` JSONB array on the parent, preserving every
    field (``id``, ``box_uid``, ``po_no``, ``dc_no``, ``piece_no``, ``qty``,
    ``scanned_by``, ``scanned_at``) so the receiving endpoints behave exactly as
    before.

Both directions migrate the data; `downgrade` rebuilds the two tables and
repopulates them from the merged columns, so this is reversible.

See docs/adr/0007-merge-sap-outward-satellites.md.

Revision ID: 0020_merge_outward_satellites  (<=32 chars: alembic_version.version_num)
Revises: 0019_movement_type_master
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0020_merge_outward_satellites"
down_revision = "0019_movement_type_master"
branch_labels = None
depends_on = None

SCHEMA = "masterdata"


def upgrade() -> None:
    # --- 1. new columns on the parent ------------------------------------
    op.add_column(
        "sap_outwards",
        sa.Column("outward_status_note", sa.String(length=255), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "sap_outwards",
        sa.Column(
            "inward_scans",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        schema=SCHEMA,
    )

    # --- 2. carry the status note across ---------------------------------
    op.execute(
        f"""
        UPDATE {SCHEMA}.sap_outwards o
           SET outward_status_note = st.note
          FROM {SCHEMA}.sap_outward_statuses st
         WHERE st.sap_outward_id = o.id
           AND st.note IS NOT NULL
        """
    )

    # Safety net: if any line somehow had no mirrored status, take the
    # satellite's value rather than losing it.
    op.execute(
        f"""
        UPDATE {SCHEMA}.sap_outwards o
           SET outward_status = st.status
          FROM {SCHEMA}.sap_outward_statuses st
         WHERE st.sap_outward_id = o.id
           AND o.outward_status IS DISTINCT FROM st.status
           AND o.outward_status IS NULL
        """
    )

    # --- 3. carry the per-piece scans across ------------------------------
    op.execute(
        f"""
        UPDATE {SCHEMA}.sap_outwards o
           SET inward_scans = agg.scans
          FROM (
                SELECT sap_outward_id,
                       jsonb_agg(
                           jsonb_build_object(
                               'id',         id::text,
                               'box_uid',    box_uid,
                               'po_no',      po_no,
                               'dc_no',      dc_no,
                               'piece_no',   piece_no,
                               'qty',        CASE WHEN qty IS NULL THEN NULL
                                                  ELSE qty::text END,
                               'scanned_by', scanned_by,
                               'scanned_at', to_char(
                                   scanned_at AT TIME ZONE 'UTC',
                                   'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"'
                               )
                           )
                           ORDER BY piece_no
                       ) AS scans
                  FROM {SCHEMA}.sap_inward_scans
                 GROUP BY sap_outward_id
               ) agg
         WHERE agg.sap_outward_id = o.id
        """
    )

    # --- 4. the satellites are now redundant ------------------------------
    op.drop_table("sap_inward_scans", schema=SCHEMA)
    op.drop_table("sap_outward_statuses", schema=SCHEMA)


def downgrade() -> None:
    # --- 1. rebuild the two tables exactly as 0013 / 0018 created them ----
    op.create_table(
        "sap_outward_statuses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sap_outward_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sap_outward_statuses"),
        sa.ForeignKeyConstraint(
            ["sap_outward_id"],
            [f"{SCHEMA}.sap_outwards.id"],
            name="fk_sap_outward_statuses_sap_outward_id_sap_outwards",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("sap_outward_id", name="uq_sap_outward_statuses_sap_outward_id"),
        sa.CheckConstraint(
            "status IN ('NEW','ALLOCATED','PACKED','DISPATCHED','HOLD')",
            name="ck_sap_outward_statuses_status_allowed",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_sap_outward_statuses_status", "sap_outward_statuses", ["status"], schema=SCHEMA
    )

    op.create_table(
        "sap_inward_scans",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sap_outward_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("box_uid", sa.String(length=128), nullable=True),
        sa.Column("po_no", sa.String(length=64), nullable=True),
        sa.Column("dc_no", sa.String(length=64), nullable=True),
        sa.Column("piece_no", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Numeric(precision=18, scale=3), nullable=True),
        sa.Column("scanned_by", sa.String(length=64), nullable=True),
        sa.Column(
            "scanned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sap_inward_scans"),
        sa.ForeignKeyConstraint(
            ["sap_outward_id"],
            [f"{SCHEMA}.sap_outwards.id"],
            name="fk_sap_inward_scans_sap_outward_id_sap_outwards",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("sap_outward_id", "piece_no", name="uq_sap_inward_scans_piece"),
        sa.CheckConstraint("piece_no >= 1", name="ck_sap_inward_scans_piece_no_positive"),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_sap_inward_scans_sap_outward_id", "sap_inward_scans", ["sap_outward_id"], schema=SCHEMA
    )
    op.create_index("ix_sap_inward_scans_box_uid", "sap_inward_scans", ["box_uid"], schema=SCHEMA)

    # --- 2. push the merged data back out --------------------------------
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.sap_outward_statuses (id, sap_outward_id, status, note)
        SELECT gen_random_uuid(), o.id, COALESCE(o.outward_status, 'NEW'), o.outward_status_note
          FROM {SCHEMA}.sap_outwards o
        """
    )
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.sap_inward_scans
               (id, sap_outward_id, box_uid, po_no, dc_no, piece_no, qty, scanned_by, scanned_at)
        SELECT COALESCE((sc->>'id')::uuid, gen_random_uuid()),
               o.id,
               sc->>'box_uid',
               sc->>'po_no',
               sc->>'dc_no',
               (sc->>'piece_no')::int,
               (sc->>'qty')::numeric,
               sc->>'scanned_by',
               (sc->>'scanned_at')::timestamptz
          FROM {SCHEMA}.sap_outwards o,
               LATERAL jsonb_array_elements(o.inward_scans) AS sc
         WHERE jsonb_typeof(o.inward_scans) = 'array'
        """
    )

    # --- 3. drop the merged columns --------------------------------------
    op.drop_column("sap_outwards", "inward_scans", schema=SCHEMA)
    op.drop_column("sap_outwards", "outward_status_note", schema=SCHEMA)
