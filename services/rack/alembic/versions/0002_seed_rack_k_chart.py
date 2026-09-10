"""seed RACK-K physical rack chart (real data)

Loads the occupied slots from the physical "RACK - K" chart photographed on the
shop floor: two faces (KL = left / column 1, KR = right / column 2), 20 rows
each, one or two model numbers per slot. Idempotent — rows already present
(matched on the uq_rack_slot natural key) are left untouched.

Revision ID: 0002_seed_rack_k_chart
Revises: 0001_initial
Create Date: 2026-09-10
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_seed_rack_k_chart"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# column 1 == KL (left face), column 2 == KR (right face)
_CHART: dict[int, dict[int, list[str]]] = {
    1: {
        1: ["90145", "90148"], 2: ["90148"], 3: ["90148"],
        4: ["90152", "90169"], 5: ["90169", "90170"], 6: ["90171", "90174"],
        7: ["90174"], 8: ["90174"], 9: ["90176", "90174"], 10: ["90198"],
        11: ["9308"], 12: ["9323", "9324"], 13: ["94001", "94002"],
        14: ["94003", "94004"], 15: ["94006", "94009"], 16: ["94011", "94201"],
        17: ["94202", "94203"], 18: ["94204", "94206"], 19: ["94209", "94211"],
        20: ["95058", "9441"],
    },
    2: {
        1: ["90086"], 2: ["90086"], 3: ["90102"], 4: ["90102"], 5: ["90102"],
        6: ["90102"], 7: ["90103", "90104"], 8: ["90106", "90110"], 9: ["90110"],
        10: ["90114", "90124"], 11: ["90127"], 12: ["90127"], 13: ["90127"],
        14: ["90133", "90134"], 15: ["90134"], 16: ["90140"], 17: ["90140"],
        18: ["90142"], 19: ["90142"], 20: ["90142"],
    },
}

_CHART_DATE = datetime(2026, 9, 10, tzinfo=timezone.utc)


def _rows() -> list[dict]:
    out: list[dict] = []
    for column_no, rows in _CHART.items():
        face = "L" if column_no == 1 else "R"
        for row_no, models in rows.items():
            for shelf_no, model_no in enumerate(models, start=1):
                out.append(
                    {
                        "id": uuid.uuid4(),
                        "rack_code": "K",
                        "row_no": row_no,
                        "column_no": column_no,
                        "shelf_no": shelf_no,
                        "location_name": f"K{face} {row_no}",
                        "occupied": True,
                        "occupied_by_model": model_no,
                        "date_of_occupied": _CHART_DATE,
                        "notes": "seeded from RACK-K physical chart",
                        "status": "active",
                    }
                )
    return out


def upgrade() -> None:
    bind = op.get_bind()
    rack = sa.table(
        "rack",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("rack_code", sa.String),
        sa.column("row_no", sa.Integer),
        sa.column("column_no", sa.Integer),
        sa.column("shelf_no", sa.Integer),
        sa.column("location_name", sa.String),
        sa.column("occupied", sa.Boolean),
        sa.column("occupied_by_model", sa.String),
        sa.column("date_of_occupied", sa.DateTime(timezone=True)),
        sa.column("notes", sa.Text),
        sa.column("status", sa.String),
    )
    existing = {
        tuple(r)
        for r in bind.execute(
            sa.text(
                "SELECT rack_code, row_no, column_no, shelf_no FROM rack "
                "WHERE rack_code = 'K'"
            )
        ).all()
    }
    fresh = [
        r
        for r in _rows()
        if (r["rack_code"], r["row_no"], r["column_no"], r["shelf_no"]) not in existing
    ]
    if fresh:
        op.bulk_insert(rack, fresh)


def downgrade() -> None:
    op.execute(
        "DELETE FROM rack WHERE rack_code = 'K' "
        "AND notes = 'seeded from RACK-K physical chart'"
    )
