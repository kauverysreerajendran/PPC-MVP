from __future__ import annotations

from sqladmin.filters import BooleanFilter, StaticValuesFilter

from app.admin.permissions import AdminRole, BaseAdminView
from app.core.rbac import Role
from app.models.user import User

# Never let these reach a template, a form, or an export.
_SECRET_COLUMNS = ("hashed_password",)


class UserAdmin(BaseAdminView, model=User):
    name = "User"
    name_plural = "Users"
    icon = "fa-solid fa-users"
    category = "Accounts"

    column_list = [
        User.id,
        User.email,
        User.full_name,
        User.role,
        User.admin_role,
        User.is_active,
        User.is_verified,
        User.created_at,
    ]
    column_details_list = [
        User.id,
        User.email,
        User.full_name,
        User.role,
        User.admin_role,
        User.is_active,
        User.is_verified,
        User.created_at,
        User.updated_at,
        User.deleted_at,
        User.projects,
    ]  # note: hashed_password deliberately omitted from every list

    column_export_exclude_list = list(_SECRET_COLUMNS)
    column_searchable_list = [User.email, User.full_name]
    column_sortable_list = [User.id, User.email, User.role, User.created_at, User.is_active]
    column_default_sort = ("created_at", True)
    column_filters = [
        StaticValuesFilter(User.role, [(r.value, r.value.title()) for r in Role]),
        StaticValuesFilter(
            User.admin_role, [(r.value, r.name.replace("_", " ").title()) for r in AdminRole]
        ),
        BooleanFilter(User.is_active),
        BooleanFilter(User.is_verified),
    ]
    column_labels = {"admin_role": "Admin role", "full_name": "Name"}

    # Forms: hide secrets and server-managed columns.
    form_excluded_columns = [
        *_SECRET_COLUMNS,
        "created_at",
        "updated_at",
        "deleted_at",
        "projects",
    ]
    # Only SUPER_ADMIN may grant/revoke admin access or change the app role.
    superuser_only_fields = ("admin_role", "role")

    async def check_can_delete(self, request, model) -> bool:  # type: ignore[override]
        # Deleting a user row is destructive (FK RESTRICT from projects). Reserve
        # it for SUPER_ADMIN; everyone else should deactivate instead.
        from app.admin.permissions import request_role

        role = request_role(request)
        return bool(role and role.is_super)
