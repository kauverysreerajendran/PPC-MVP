"""Browser DB admin for `rack` (SQLAdmin), mounted at /rack-admin.

Local dev is open on localhost; any non-development environment requires the
password in ``RACK_ADMIN_PASSWORD`` (login user is ignored). Mirrors
`services/masterdata/app/admin.py`.
"""

from __future__ import annotations

from fastapi import FastAPI
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request

from app.config import settings
from app.db import engine
from app.models import Rack

ADMIN_BASE_URL = "/rack-admin"


class _Auth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        if str(form.get("password")) == settings.RACK_ADMIN_PASSWORD:
            request.session["rack_admin"] = "1"
            return True
        return False

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        if settings.ENVIRONMENT == "development":
            return True
        return request.session.get("rack_admin") == "1"


class RackAdmin(ModelView, model=Rack):
    name = "Rack Slot"
    name_plural = "Rack Slots"
    column_list = [
        Rack.rack_code,
        Rack.location_name,
        Rack.row_no,
        Rack.column_no,
        Rack.shelf_no,
        Rack.occupied,
        Rack.occupied_by_model,
        Rack.date_of_occupied,
        Rack.status,
    ]
    column_searchable_list = [
        Rack.rack_code,
        Rack.location_name,
        Rack.occupied_by_model,
    ]
    column_default_sort = ("rack_code", False)
    page_size = 50


def init_admin(app: FastAPI) -> None:
    admin = Admin(
        app,
        engine=engine,
        base_url=ADMIN_BASE_URL,
        title="Rack DB Admin",
        authentication_backend=_Auth(secret_key=settings.SECRET_KEY),
    )
    admin.add_view(RackAdmin)
