"""add users.admin_role for the SQLAdmin panel

Revision ID: 0002_add_user_admin_role
Revises: 0001_initial
Create Date: 2026-09-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_add_user_admin_role"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("admin_role", sa.String(length=20), nullable=True))
    # Partial index: only admins are looked up by this column, and the set is tiny.
    op.create_index(
        "ix_users_admin_role",
        "users",
        ["admin_role"],
        postgresql_where=sa.text("admin_role IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_users_admin_role", table_name="users")
    op.drop_column("users", "admin_role")
