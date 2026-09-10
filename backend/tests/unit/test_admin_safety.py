"""Guardrails for the /admin panel: secrets must never be exposed, and the
read-only tier must never be able to write."""

from __future__ import annotations

import pytest
from app.admin.permissions import AdminRole, BaseAdminView
from app.admin.views import ADMIN_VIEWS

pytestmark = pytest.mark.unit

SENSITIVE = {"hashed_password", "token_hash", "password", "secret", "api_key", "access_token"}


def _names(items) -> set[str]:
    out: set[str] = set()
    for it in items or []:
        out.add(getattr(it, "key", getattr(it, "name", str(it))))
    return out


@pytest.mark.parametrize("view", ADMIN_VIEWS, ids=lambda v: v.__name__)
def test_no_sensitive_columns_in_any_surface(view: type[BaseAdminView]) -> None:
    for attr in (
        "column_list",
        "column_details_list",
        "column_searchable_list",
        "column_sortable_list",
        "column_export_list",
    ):
        exposed = _names(getattr(view, attr, None))
        assert not (exposed & SENSITIVE), f"{view.__name__}.{attr} leaks {exposed & SENSITIVE}"


def test_audit_log_is_immutable_for_everyone() -> None:
    from app.admin.views.audit_logs import AuditLogAdmin

    assert AuditLogAdmin.always_read_only is True
    assert AuditLogAdmin.can_create is False
    assert AuditLogAdmin.can_edit is False
    assert AuditLogAdmin.can_delete is False


class _Req:
    def __init__(self, role: str | None) -> None:
        self.session = {"admin_role": role} if role else {}


@pytest.mark.asyncio
@pytest.mark.parametrize("view", ADMIN_VIEWS, ids=lambda v: v.__name__)
async def test_read_only_admin_cannot_write(view: type[BaseAdminView]) -> None:
    v = view()
    ro = _Req(AdminRole.READ_ONLY_ADMIN.value)
    assert await v.check_can_create(ro) is False
    assert await v.check_can_edit(ro, object()) is False
    assert await v.check_can_delete(ro, object()) is False


@pytest.mark.asyncio
async def test_anonymous_has_no_admin_access() -> None:
    v = ADMIN_VIEWS[0]()
    anon = _Req(None)
    assert v.is_accessible(anon) is False
    assert await v.check_can_create(anon) is False
