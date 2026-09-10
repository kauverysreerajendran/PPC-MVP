from __future__ import annotations

from sqlalchemy import Boolean, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.rbac import Role
from app.db.base import Base, SoftDeleteMixin, TimestampMixin


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"
    __table_args__ = (
        Index("uq_users_email_lower", text("lower(email)"), unique=True),
        Index("ix_users_created_at", "created_at"),
        Index(
            "ix_users_admin_role",
            "admin_role",
            postgresql_where=text("admin_role IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(200))
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default=Role.member.value, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Access to the /admin panel. NULL = no admin access.
    # One of: super_admin | admin | read_only_admin  (see app.admin.permissions.AdminRole)
    admin_role: Mapped[str | None] = mapped_column(String(20), default=None, nullable=True)

    projects: Mapped[list[Project]] = relationship(  # noqa: F821
        back_populates="owner", lazy="raise"
    )
