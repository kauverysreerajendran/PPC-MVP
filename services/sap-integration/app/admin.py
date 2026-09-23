"""Browser DB admin for the `sap` schema (SQLAdmin), mounted at /admin.

Local dev is open on localhost; any non-development environment requires the
password in ``SAP_ADMIN_PASSWORD`` (login user is ignored).
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import FastAPI
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request

from app.config import settings
from app.db import engine
from app.models import SapInwardRecord, SapSyncRun

# Distinct from the monolith's /admin so both can sit behind one gateway.
ADMIN_BASE_URL = "/sap-admin"


def _num(value: object) -> str:
    """420.000 -> '420', 420.5 -> '420.5', keep everything else as text.

    ``quantity`` is Numeric(18, 3), so a whole lot renders three zeros it does
    not mean. Same rule as the masterdata admin's ``_num``.
    """
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return str(int(value) if value == value.to_integral_value() else value.normalize())
    return str(value)


class _Auth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        if str(form.get("password")) == settings.SAP_ADMIN_PASSWORD:
            request.session["sap_admin"] = "1"
            return True
        return False

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        if settings.ENVIRONMENT == "development":
            return True
        return request.session.get("sap_admin") == "1"


class SapInwardRecordAdmin(ModelView, model=SapInwardRecord):
    name = "Inward Record"
    name_plural = "Inward Records"
    column_list = [
        SapInwardRecord.sap_reference_id,
        SapInwardRecord.transaction_date,
        SapInwardRecord.dc_no,
        SapInwardRecord.po_no,
        SapInwardRecord.material_no,
        SapInwardRecord.model_no,
        SapInwardRecord.vendor_name,
        SapInwardRecord.quantity,
        SapInwardRecord.movement_type,
        SapInwardRecord.remark,
    ]
    column_formatters = {SapInwardRecord.quantity: lambda o, _a: _num(o.quantity)}
    column_formatters_detail = column_formatters
    column_default_sort = ("transaction_date", True)
    column_searchable_list = [
        SapInwardRecord.sap_reference_id,
        SapInwardRecord.dc_no,
        SapInwardRecord.po_no,
        SapInwardRecord.material_no,
        SapInwardRecord.vendor_name,
    ]
    page_size = 50


class SapSyncRunAdmin(ModelView, model=SapSyncRun):
    name_plural = "Sync Runs"
    column_list = [
        SapSyncRun.started_at,
        SapSyncRun.finished_at,
        SapSyncRun.status,
        SapSyncRun.provider,
        SapSyncRun.records_ingested,
        SapSyncRun.triggered_by,
        SapSyncRun.error,
    ]
    column_default_sort = ("started_at", True)
    can_create = False
    can_edit = False


def init_admin(app: FastAPI) -> None:
    admin = Admin(
        app,
        engine=engine,
        base_url=ADMIN_BASE_URL,
        title="SAP DB Admin",
        authentication_backend=_Auth(secret_key=settings.SECRET_KEY),
    )
    admin.add_view(SapInwardRecordAdmin)
    admin.add_view(SapSyncRunAdmin)
