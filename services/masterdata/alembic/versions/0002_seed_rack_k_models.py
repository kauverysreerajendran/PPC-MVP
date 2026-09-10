"""seed model numbers from the RACK-K physical chart (real data)

The shop-floor "RACK - K" chart lists the model numbers physically stored on
that rack. Those model numbers are real master data, so they are registered in
``master_models`` here. Idempotent: existing ``model_no`` rows are left as-is.

Revision ID: 0002_seed_rack_k_models
Revises: 0001_initial
Create Date: 2026-09-10
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_seed_rack_k_models"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# distinct model numbers read off the RACK-K chart (KL + KR faces)
_MODELS: list[str] = [
    "9308", "9323", "9324", "9441",
    "90086", "90102", "90103", "90104", "90106", "90110", "90114", "90124",
    "90127", "90133", "90134", "90140", "90142", "90145", "90148", "90152",
    "90169", "90170", "90171", "90174", "90176", "90198",
    "94001", "94002", "94003", "94004", "94006", "94009", "94011",
    "94201", "94202", "94203", "94204", "94206", "94209", "94211",
    "95058",
]


def upgrade() -> None:
    bind = op.get_bind()
    have = {
        r[0]
        for r in bind.execute(
            sa.text("SELECT model_no FROM master_models WHERE model_no = ANY(:v)"),
            {"v": _MODELS},
        ).all()
    }
    fresh = [
        {
            "id": uuid.uuid4(),
            "model_no": mn,
            "description": "registered from RACK-K physical chart",
            "status": "active",
        }
        for mn in _MODELS
        if mn not in have
    ]
    if fresh:
        table = sa.table(
            "master_models",
            sa.column("id", postgresql.UUID(as_uuid=True)),
            sa.column("model_no", sa.String),
            sa.column("description", sa.Text),
            sa.column("status", sa.String),
        )
        op.bulk_insert(table, fresh)


def downgrade() -> None:
    op.execute(
        "DELETE FROM master_models "
        "WHERE description = 'registered from RACK-K physical chart'"
    )
