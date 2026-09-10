"""Builds and wires the SQLAdmin `Admin` instance onto the FastAPI app.

Topology:
    Next.js -> FastAPI
                 ├── /api/v1/*   application APIs
                 └── /admin      SQLAdmin UI -> SQLAlchemy -> PostgreSQL

The panel uses the app's async writer engine. There is no raw-SQL surface: every
action goes through SQLAlchemy ORM select/insert/update/delete built by SQLAdmin.
"""

from __future__ import annotations

from fastapi import FastAPI
from sqladmin import Admin

from app.admin.authentication import AdminAuth
from app.admin.views import ADMIN_VIEWS
from app.core.config import settings
from app.db.session import engine_rw

ADMIN_BASE_URL = "/admin"


def create_admin(app: FastAPI) -> Admin:
    admin = Admin(
        app,
        engine=engine_rw,
        base_url=ADMIN_BASE_URL,
        title=f"{settings.PROJECT_NAME} Admin",
        authentication_backend=AdminAuth(secret_key=settings.SECRET_KEY),
    )
    for view in ADMIN_VIEWS:
        admin.add_view(view)
    return admin
