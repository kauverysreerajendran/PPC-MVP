"""Admin RBAC: three admin tiers plus a base view that enforces them.

    SUPER_ADMIN       full access to every view and every row action
    ADMIN             create / edit / delete on operational data; cannot touch
                      the `admin_role` column or delete users
    READ_ONLY_ADMIN   browse, search, filter, sort, open records — no writes

Enforcement lives in `BaseAdminView` so individual views only declare *what*
they expose, never re-implement *who* may change it.
"""

from __future__ import annotations

import enum

from sqladmin import ModelView
from starlette.requests import Request

SESSION_USER_ID = "admin_user_id"
SESSION_ROLE = "admin_role"
SESSION_EMAIL = "admin_email"


class AdminRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    READ_ONLY_ADMIN = "read_only_admin"

    @classmethod
    def values(cls) -> list[str]:
        return [r.value for r in cls]

    @property
    def can_write(self) -> bool:
        return self in (AdminRole.SUPER_ADMIN, AdminRole.ADMIN)

    @property
    def is_super(self) -> bool:
        return self is AdminRole.SUPER_ADMIN


def request_role(request: Request) -> AdminRole | None:
    raw = request.session.get(SESSION_ROLE)
    try:
        return AdminRole(raw) if raw else None
    except ValueError:
        return None


class BaseAdminView(ModelView):
    """Shared behaviour for every registered admin view."""

    # Sensible list-view ergonomics for large tables.
    page_size = 25
    page_size_options = (25, 50, 100, 200)
    can_export = True

    #: Views that must stay read-only for *all* admin tiers (e.g. audit trail).
    always_read_only: bool = False
    #: Columns only SUPER_ADMIN may set through a form.
    superuser_only_fields: tuple[str, ...] = ()

    def is_accessible(self, request: Request) -> bool:
        return request_role(request) is not None

    def is_visible(self, request: Request) -> bool:
        return request_role(request) is not None

    async def check_can_create(self, request: Request) -> bool:
        role = request_role(request)
        return bool(role and role.can_write and not self.always_read_only)

    async def check_can_edit(self, request: Request, model: object) -> bool:
        role = request_role(request)
        return bool(role and role.can_write and not self.always_read_only)

    async def check_can_delete(self, request: Request, model: object) -> bool:
        role = request_role(request)
        if not role or self.always_read_only:
            return False
        return role.can_write

    # --- strip protected fields from writes -------------------------------
    def _sanitize(self, request: Request, data: dict) -> dict:
        role = request_role(request)
        if role and role.is_super:
            return data
        for field in self.superuser_only_fields:
            data.pop(field, None)
        return data

    async def insert_model(self, request: Request, data: dict):  # type: ignore[override]
        return await super().insert_model(request, self._sanitize(request, data))

    async def update_model(self, request: Request, pk: str, data: dict):  # type: ignore[override]
        return await super().update_model(request, pk, self._sanitize(request, data))
