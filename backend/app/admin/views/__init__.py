"""Registry of admin views.

Only models that exist in this application are registered. The brief's example
menu (Roles, Permissions, Products, Orders, Categories) maps onto this codebase
as follows:

    Roles / Permissions  -> not separate tables here; `role` is an enum column on
                            `users` and the RBAC matrix lives in `app.core.rbac`.
                            Exposed via filters/columns on UserAdmin.
    Products / Orders /   -> domain tables this starter does not yet have. When
    Categories               you add the models, drop a `ProductAdmin` etc. in
                             this folder and append it to `ADMIN_VIEWS`.

To add a view: subclass `BaseAdminView`, then list it below.
"""

from __future__ import annotations

from app.admin.views.audit_logs import AuditLogAdmin
from app.admin.views.projects import ProjectAdmin
from app.admin.views.services import build_service_views
from app.admin.views.sessions import RefreshTokenAdmin
from app.admin.views.users import UserAdmin

#: Tables owned by this app (the `public` schema).
OWN_VIEWS = [
    UserAdmin,
    RefreshTokenAdmin,
    ProjectAdmin,
    AuditLogAdmin,
]

# Tables owned by the sap / masterdata / rack services. They live in dedicated
# schemas of this same database, so one panel serves the whole system instead of
# four panels on four ports. See app/admin/views/services.py.
ADMIN_VIEWS = [*OWN_VIEWS, *build_service_views()]

__all__ = ["ADMIN_VIEWS", "OWN_VIEWS"]
