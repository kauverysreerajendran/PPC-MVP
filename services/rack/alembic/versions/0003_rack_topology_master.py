"""rack topology master + derived tray slots

Introduces ``rack_master`` — the physical topology master that every storage
location is derived from — and reshapes ``rack`` into a tray-level slot table
addressed by warehouse / aisle / rack / shelf / row / tray.

What this migration does, in order:

1. create ``rack_master``;
2. widen ``rack`` with ``warehouse_code`` / ``aisle_code`` / ``tray_no`` /
   ``slot_state`` and drop the old ``column_no`` face coordinate;
3. re-map the RACK-K chart rows seeded by 0002 onto the new coordinate space.
   The chart records 20 positions on each of two faces (KL / KR) with one or
   two model numbers per position. Those become: chart position -> shelf (the
   20 positions spread evenly over the rack's shelves), face -> vertical row,
   and the sub-slot -> tray within that shelf/row. Model numbers, dates and the
   original ``location_name`` ("KL 1") are carried over untouched;
4. seed the rack masters for the CBFC warehouse — aisle R (the photographed
   aisle, 14 racks) and aisle A (6 racks of a different shape) — so the UI has
   a real, non-uniform structure to render;
5. materialise every tray slot from those masters. Only rack K carries
   occupancy; every other tray is created empty and awaits real data.

Revision ID: 0003_rack_topology_master
Revises: 0002_seed_rack_k_chart
Create Date: 2026-09-10
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_rack_topology_master"
down_revision: str | None = "0002_seed_rack_k_chart"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

WAREHOUSE = "CBFC"
WAREHOUSE_NAME = "CBFC Plant Store"
#: number of positions on the physical RACK-K chart, per face
CHART_POSITIONS = 20

# (rack_code, position, side, shelves, rows, trays)
_AISLE_R: list[tuple[str, int, str, int, int, int]] = [
    ("A", 1, "L", 6, 4, 15),
    ("B", 2, "L", 5, 4, 15),
    ("C", 3, "L", 6, 4, 15),
    ("D", 4, "L", 5, 3, 15),
    ("E", 5, "L", 6, 4, 15),
    ("F", 6, "L", 6, 4, 12),
    ("G", 7, "L", 5, 3, 12),
    ("H", 8, "R", 6, 4, 15),
    ("J", 9, "R", 5, 4, 15),
    ("K", 10, "R", 6, 4, 15),
    ("L", 11, "R", 6, 3, 15),
    ("M", 12, "R", 5, 3, 12),
    ("N", 13, "R", 6, 4, 12),
    ("P", 14, "R", 5, 4, 12),
]

# a deliberately different shape, so the same UI has to adapt
_AISLE_A: list[tuple[str, int, str, int, int, int]] = [
    ("A1", 1, "L", 5, 3, 12),
    ("A2", 2, "L", 5, 3, 12),
    ("A3", 3, "L", 4, 3, 12),
    ("A4", 4, "R", 5, 3, 12),
    ("A5", 5, "R", 4, 2, 12),
    ("A6", 6, "R", 5, 3, 12),
]

_AISLES: list[tuple[str, str, list[tuple[str, int, str, int, int, int]]]] = [
    ("R", "R (Right)", _AISLE_R),
    ("A", "A (Left)", _AISLE_A),
]


def _rack_master_table() -> sa.Table:
    return sa.table(
        "rack_master",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("warehouse_code", sa.String),
        sa.column("warehouse_name", sa.String),
        sa.column("aisle_code", sa.String),
        sa.column("aisle_name", sa.String),
        sa.column("rack_code", sa.String),
        sa.column("rack_name", sa.String),
        sa.column("position", sa.Integer),
        sa.column("side", sa.String),
        sa.column("shelf_count", sa.Integer),
        sa.column("row_count", sa.Integer),
        sa.column("tray_count", sa.Integer),
        sa.column("notes", sa.Text),
        sa.column("status", sa.String),
    )


def _rack_table() -> sa.Table:
    return sa.table(
        "rack",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("warehouse_code", sa.String),
        sa.column("aisle_code", sa.String),
        sa.column("rack_code", sa.String),
        sa.column("shelf_no", sa.Integer),
        sa.column("row_no", sa.Integer),
        sa.column("tray_no", sa.Integer),
        sa.column("location_name", sa.String),
        sa.column("slot_state", sa.String),
        sa.column("occupied", sa.Boolean),
        sa.column("status", sa.String),
    )


def _location_code(rack_code: str, shelf_no: int, row_no: int, tray_no: int) -> str:
    return f"{rack_code}-S{shelf_no}-R{row_no}-T{tray_no:02d}"


def _remap_chart(bind: sa.engine.Connection) -> None:
    """Move the 0002 chart rows onto shelf / row / tray coordinates."""
    shelves = next(r[3] for r in _AISLE_R if r[0] == "K")
    legacy = bind.execute(
        sa.text(
            "SELECT id, row_no, column_no, shelf_no FROM rack "
            "WHERE rack_code = 'K' ORDER BY column_no, row_no, shelf_no"
        )
    ).all()

    # next free tray within each (shelf, row) bucket
    next_tray: dict[tuple[int, int], int] = defaultdict(lambda: 1)
    for row_id, position, face, sub_slot in legacy:
        shelf_no = min(shelves, (position - 1) * shelves // CHART_POSITIONS + 1)
        row_no = face  # KL -> row 1, KR -> row 2
        tray_no = next_tray[(shelf_no, row_no)]
        next_tray[(shelf_no, row_no)] = tray_no + 1
        bind.execute(
            sa.text(
                "UPDATE rack SET warehouse_code = :w, aisle_code = :a, "
                "shelf_no = :shelf, row_no = :row, tray_no = :tray "
                "WHERE id = :id"
            ),
            {
                "w": WAREHOUSE,
                "a": "R",
                "shelf": shelf_no,
                "row": row_no,
                "tray": tray_no,
                "id": row_id,
            },
        )
        # `sub_slot` (the 1st/2nd model on one chart position) is what made the
        # tray distinct; it is now folded into tray_no.
        _ = sub_slot


def _seed_masters(bind: sa.engine.Connection) -> None:
    existing = {
        (w, a, r)
        for w, a, r in bind.execute(
            sa.text("SELECT warehouse_code, aisle_code, rack_code FROM rack_master")
        ).all()
    }
    rows = []
    for aisle_code, aisle_name, racks in _AISLES:
        for rack_code, position, side, shelves, rack_rows, trays in racks:
            if (WAREHOUSE, aisle_code, rack_code) in existing:
                continue
            rows.append(
                {
                    "id": uuid.uuid4(),
                    "warehouse_code": WAREHOUSE,
                    "warehouse_name": WAREHOUSE_NAME,
                    "aisle_code": aisle_code,
                    "aisle_name": aisle_name,
                    "rack_code": rack_code,
                    "rack_name": f"Rack {rack_code}",
                    "position": position,
                    "side": side,
                    "shelf_count": shelves,
                    "row_count": rack_rows,
                    "tray_count": trays,
                    "notes": "seeded physical rack topology",
                    "status": "active",
                }
            )
    if rows:
        op.bulk_insert(_rack_master_table(), rows)


def _materialize(bind: sa.engine.Connection) -> None:
    """Create every tray slot the seeded masters describe (idempotent)."""
    for aisle_code, _aisle_name, racks in _AISLES:
        for rack_code, _position, _side, shelves, rack_rows, trays in racks:
            taken = {
                (shelf, row, tray)
                for shelf, row, tray in bind.execute(
                    sa.text(
                        "SELECT shelf_no, row_no, tray_no FROM rack "
                        "WHERE warehouse_code = :w AND aisle_code = :a "
                        "AND rack_code = :r"
                    ),
                    {"w": WAREHOUSE, "a": aisle_code, "r": rack_code},
                ).all()
            }
            batch = []
            for shelf_no in range(1, shelves + 1):
                for row_no in range(1, rack_rows + 1):
                    for tray_no in range(1, trays + 1):
                        if (shelf_no, row_no, tray_no) in taken:
                            continue
                        batch.append(
                            {
                                "id": uuid.uuid4(),
                                "warehouse_code": WAREHOUSE,
                                "aisle_code": aisle_code,
                                "rack_code": rack_code,
                                "shelf_no": shelf_no,
                                "row_no": row_no,
                                "tray_no": tray_no,
                                "location_name": _location_code(
                                    rack_code, shelf_no, row_no, tray_no
                                ),
                                "slot_state": "empty",
                                "occupied": False,
                                "status": "active",
                            }
                        )
            if batch:
                op.bulk_insert(_rack_table(), batch)


def upgrade() -> None:
    bind = op.get_bind()

    # --- 1. topology master ---
    op.create_table(
        "rack_master",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("warehouse_code", sa.String(length=32), nullable=False),
        sa.Column("warehouse_name", sa.String(length=64), nullable=True),
        sa.Column("aisle_code", sa.String(length=32), nullable=False),
        sa.Column("aisle_name", sa.String(length=64), nullable=True),
        sa.Column("rack_code", sa.String(length=32), nullable=False),
        sa.Column("rack_name", sa.String(length=64), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("side", sa.String(length=8), nullable=True),
        sa.Column("shelf_count", sa.Integer(), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("tray_count", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_rack_master"),
        sa.UniqueConstraint(
            "warehouse_code", "aisle_code", "rack_code", name="uq_rack_master_rack"
        ),
        sa.CheckConstraint("status IN ('active','inactive')", name="ck_rack_master_status_allowed"),
        sa.CheckConstraint("shelf_count BETWEEN 1 AND 40", name="ck_rack_master_shelf_count_range"),
        sa.CheckConstraint("row_count BETWEEN 1 AND 40", name="ck_rack_master_row_count_range"),
        sa.CheckConstraint("tray_count BETWEEN 1 AND 100", name="ck_rack_master_tray_count_range"),
    )
    op.create_index("ix_rack_master_warehouse_code", "rack_master", ["warehouse_code"])
    op.create_index("ix_rack_master_aisle_code", "rack_master", ["aisle_code"])

    # --- 2. widen the slot table ---
    op.add_column("rack", sa.Column("warehouse_code", sa.String(length=32), nullable=True))
    op.add_column("rack", sa.Column("aisle_code", sa.String(length=32), nullable=True))
    op.add_column("rack", sa.Column("tray_no", sa.Integer(), nullable=True))
    op.add_column(
        "rack",
        sa.Column("slot_state", sa.String(length=16), nullable=False, server_default="empty"),
    )

    # --- 3. carry the RACK-K chart across ---
    # The old natural key is dropped first: remapping moves rows through
    # coordinates that collide under (rack_code, row_no, column_no, shelf_no).
    op.drop_constraint("uq_rack_slot", "rack", type_="unique")
    _remap_chart(bind)
    bind.execute(
        sa.text(
            "UPDATE rack SET warehouse_code = COALESCE(warehouse_code, :w), "
            "aisle_code = COALESCE(aisle_code, :a), tray_no = COALESCE(tray_no, 1), "
            "slot_state = CASE WHEN occupied THEN 'occupied' ELSE 'empty' END"
        ),
        {"w": WAREHOUSE, "a": "R"},
    )

    op.drop_column("rack", "column_no")
    for column in ("warehouse_code", "aisle_code", "tray_no"):
        op.alter_column("rack", column, nullable=False)

    op.create_unique_constraint(
        "uq_rack_slot",
        "rack",
        ["warehouse_code", "aisle_code", "rack_code", "shelf_no", "row_no", "tray_no"],
    )
    op.create_check_constraint("ck_rack_tray_no_positive", "rack", "tray_no >= 1")
    op.create_check_constraint(
        "ck_rack_slot_state_allowed",
        "rack",
        "slot_state IN ('empty','occupied','reserved','blocked')",
    )
    op.create_check_constraint(
        "ck_rack_slot_state_matches_occupied",
        "rack",
        "(occupied = true AND slot_state = 'occupied')"
        " OR (occupied = false AND slot_state <> 'occupied')",
    )
    op.create_index("ix_rack_slot_state", "rack", ["slot_state"])
    op.create_index(
        "ix_rack_location", "rack", ["warehouse_code", "aisle_code", "rack_code"]
    )

    # --- 4 + 5. upload the masters, then derive the slots from them ---
    _seed_masters(bind)
    _materialize(bind)


def downgrade() -> None:
    bind = op.get_bind()
    # drop the derived (never-occupied) slots; keep anything holding stock
    bind.execute(sa.text("DELETE FROM rack WHERE occupied = false"))

    op.drop_index("ix_rack_location", table_name="rack")
    op.drop_index("ix_rack_slot_state", table_name="rack")
    op.drop_constraint("ck_rack_slot_state_matches_occupied", "rack", type_="check")
    op.drop_constraint("ck_rack_slot_state_allowed", "rack", type_="check")
    op.drop_constraint("ck_rack_tray_no_positive", "rack", type_="check")
    op.drop_constraint("uq_rack_slot", "rack", type_="unique")

    op.add_column("rack", sa.Column("column_no", sa.Integer(), nullable=True))
    bind.execute(sa.text("UPDATE rack SET column_no = tray_no"))
    op.alter_column("rack", "column_no", nullable=False)
    op.create_check_constraint("ck_rack_column_no_positive", "rack", "column_no >= 1")
    op.create_unique_constraint(
        "uq_rack_slot", "rack", ["rack_code", "row_no", "column_no", "shelf_no"]
    )

    op.drop_column("rack", "slot_state")
    op.drop_column("rack", "tray_no")
    op.drop_column("rack", "aisle_code")
    op.drop_column("rack", "warehouse_code")

    op.drop_index("ix_rack_master_aisle_code", table_name="rack_master")
    op.drop_index("ix_rack_master_warehouse_code", table_name="rack_master")
    op.drop_table("rack_master")
