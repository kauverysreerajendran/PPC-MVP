"""seed real vendors (Shine Times, Kalai Industries)

Vendor master rows supplied by the business. Idempotent: existing ``vendor_code``
rows are left as-is.

Revision ID: 0003_seed_vendors
Revises: 0002_seed_rack_k_models
Create Date: 2026-09-10
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_seed_vendors"
down_revision: str | None = "0002_seed_rack_k_models"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_VENDORS: list[dict[str, str]] = [
    {"vendor_code": "SHINE-TIMES", "vendor_name": "Shine Times"},
    {"vendor_code": "KALAI-INDUSTRIES", "vendor_name": "Kalai Industries"},
]


def upgrade() -> None:
    bind = op.get_bind()
    codes = [v["vendor_code"] for v in _VENDORS]
    have = {
        r[0]
        for r in bind.execute(
            sa.text("SELECT vendor_code FROM vendors WHERE vendor_code = ANY(:v)"),
            {"v": codes},
        ).all()
    }
    fresh = [
        {
            "id": uuid.uuid4(),
            "vendor_code": v["vendor_code"],
            "vendor_name": v["vendor_name"],
            "status": "active",
        }
        for v in _VENDORS
        if v["vendor_code"] not in have
    ]
    if fresh:
        table = sa.table(
            "vendors",
            sa.column("id", postgresql.UUID(as_uuid=True)),
            sa.column("vendor_code", sa.String),
            sa.column("vendor_name", sa.String),
            sa.column("status", sa.String),
        )
        op.bulk_insert(table, fresh)


def downgrade() -> None:
    op.execute(
        "DELETE FROM vendors WHERE vendor_code IN ('SHINE-TIMES', 'KALAI-INDUSTRIES')"
    )
