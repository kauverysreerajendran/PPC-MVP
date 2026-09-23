"""Isolated Django-Admin-style panel for the FastAPI app (powered by SQLAdmin).

Mounted at /admin by `init_admin(app)`, called from `app.main`.

The panel is optional: if the installed ``sqladmin`` is too old for the views
(they need ``sqladmin.filters``, added in sqladmin 0.20), the API still boots
and only the ``/admin`` panel is skipped, with a warning in the log.
"""

from __future__ import annotations

from fastapi import FastAPI

from app.core.logging import get_logger

ADMIN_BASE_URL = "/admin"
_ADMIN_IMPORT_ERROR: Exception | None = None

try:
    from app.admin.config import ADMIN_BASE_URL, create_admin  # noqa: F811
except ImportError as exc:  # pragma: no cover - depends on the installed sqladmin
    _ADMIN_IMPORT_ERROR = exc

__all__ = ["ADMIN_BASE_URL", "init_admin"]


def init_admin(app: FastAPI) -> None:
    if _ADMIN_IMPORT_ERROR is not None:
        get_logger("app.admin").warning(
            "admin panel disabled",
            reason=str(_ADMIN_IMPORT_ERROR),
            hint="pip install -U sqladmin (>=0.20) to enable /admin",
        )
        return
    create_admin(app)
