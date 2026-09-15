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
from app.models import Rack, RackMaster

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


class RackMasterAdmin(ModelView, model=RackMaster):
    name = "Rack Master"
    name_plural = "Rack Masters"
    column_list = [
        RackMaster.warehouse_code,
        RackMaster.aisle_code,
        RackMaster.rack_code,
        RackMaster.position,
        RackMaster.side,
        RackMaster.shelf_count,
        RackMaster.row_count,
        RackMaster.tray_count,
        RackMaster.status,
    ]
    column_searchable_list = [
        RackMaster.warehouse_code,
        RackMaster.aisle_code,
        RackMaster.rack_code,
    ]
    column_default_sort = ("position", False)
    page_size = 50


class RackAdmin(ModelView, model=Rack):
    name = "Rack Slot"
    name_plural = "Rack Slots"
    column_list = [
        Rack.warehouse_code,
        Rack.aisle_code,
        Rack.rack_code,
        Rack.shelf_no,
        Rack.row_no,
        Rack.tray_no,
        Rack.location_name,
        Rack.slot_state,
        Rack.occupied_by_model,
        Rack.qty,
        Rack.lot_no,
        Rack.sap_reference_id,
        Rack.date_of_occupied,
        Rack.status,
    ]
    column_searchable_list = [
        Rack.rack_code,
        Rack.location_name,
        Rack.occupied_by_model,
        Rack.lot_no,
        Rack.sap_reference_id,
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
    admin.add_view(RackMasterAdmin)
    admin.add_view(RackAdmin)
