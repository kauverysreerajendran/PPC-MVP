"""Browser DB admin for `masterdata` (SQLAdmin), mounted at /masterdata-admin.

Local dev is open on localhost; any non-development environment requires the
password in ``MASTERDATA_ADMIN_PASSWORD`` (login user is ignored). Mirrors
`services/sap-integration/app/admin.py`.
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import FastAPI
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request

from app.config import settings
from app.db import engine
from app.models import (
    Box,
    Location,
    MasterModel,
    OutwardStatusMaster,
    PlatingColor,
    SapOutward,
    SapOutwardStatus,
    Tray,
    Vendor,
)

ADMIN_BASE_URL = "/masterdata-admin"


def _num(value: object) -> str:
    """467.000 -> '467', 467.5 -> '467.5', keep everything else as text."""
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return str(int(value) if value == value.to_integral_value() else value.normalize())
    return str(value)


def _dt(value: object) -> str:
    return value.strftime("%Y-%m-%d %H:%M") if value is not None else ""


class _Auth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        if str(form.get("password")) == settings.MASTERDATA_ADMIN_PASSWORD:
            request.session["masterdata_admin"] = "1"
            return True
        return False

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        if settings.ENVIRONMENT == "development":
            return True
        return request.session.get("masterdata_admin") == "1"


class MasterModelAdmin(ModelView, model=MasterModel):
    name = "Model"
    name_plural = "Models"
    column_list = [
        MasterModel.model_no,
        MasterModel.model_name,
        MasterModel.part,
        MasterModel.uom,
        MasterModel.status,
        MasterModel.updated_at,
    ]
    column_searchable_list = [MasterModel.model_no, MasterModel.model_name]
    column_default_sort = ("model_no", False)
    page_size = 50


class PlatingColorAdmin(ModelView, model=PlatingColor):
    name_plural = "Plating Colors"
    column_list = [
        PlatingColor.color_code,
        PlatingColor.color_name,
        PlatingColor.status,
        PlatingColor.updated_at,
    ]
    column_searchable_list = [PlatingColor.color_code, PlatingColor.color_name]
    page_size = 50


class VendorAdmin(ModelView, model=Vendor):
    column_list = [
        Vendor.vendor_code,
        Vendor.vendor_name,
        Vendor.contact_email,
        Vendor.status,
        Vendor.updated_at,
    ]
    column_searchable_list = [Vendor.vendor_code, Vendor.vendor_name]
    column_default_sort = ("vendor_code", False)
    page_size = 50


class LocationAdmin(ModelView, model=Location):
    column_list = [
        Location.location_code,
        Location.location_name,
        Location.location_type,
        Location.parent_location_id,
        Location.status,
    ]
    column_searchable_list = [Location.location_code, Location.location_name]
    page_size = 50


class TrayAdmin(ModelView, model=Tray):
    name = "Tray"
    name_plural = "Trays"
    column_list = [
        Tray.tray_id,
        Tray.box_id,
        Tray.tray_type,
        Tray.no_of_trays,
        Tray.qty,
        Tray.qty_capacity,
        Tray.status,
        Tray.updated_at,
    ]
    column_searchable_list = [Tray.tray_id, Tray.box_id, Tray.tray_type]
    column_default_sort = ("tray_id", False)
    column_formatters = {
        Tray.qty: lambda o, _a: _num(o.qty),
        Tray.qty_capacity: lambda o, _a: _num(o.qty_capacity),
        Tray.updated_at: lambda o, _a: _dt(o.updated_at),
    }
    page_size = 50


class BoxAdmin(ModelView, model=Box):
    name = "Box"
    name_plural = "Boxes"
    column_list = [Box.box_uid, Box.box_type, Box.status, Box.updated_at]
    column_searchable_list = [Box.box_uid, Box.box_type]
    column_default_sort = ("box_uid", False)
    page_size = 50


class SapOutwardAdmin(ModelView, model=SapOutward):
    name = "SAP Outward"
    name_plural = "SAP Outwards"
    column_list = [
        SapOutward.sap_reference_id,
        SapOutward.transaction_date,
        SapOutward.dc_no,
        SapOutward.po_no,
        SapOutward.material_no,
        SapOutward.model_no,
        SapOutward.vendor_code,
        SapOutward.box_uid,
        SapOutward.tray_id,
        SapOutward.tray_type,
        SapOutward.no_of_trays,
        SapOutward.front_case_trays,
        SapOutward.back_case_trays,
        SapOutward.outward_status,
        SapOutward.quantity,
        SapOutward.movement_type,
        SapOutward.status,
    ]
    column_searchable_list = [
        SapOutward.sap_reference_id,
        SapOutward.dc_no,
        SapOutward.po_no,
        SapOutward.material_no,
        SapOutward.vendor_code,
        SapOutward.box_uid,
        SapOutward.tray_id,
        SapOutward.outward_status,
    ]
    column_default_sort = ("transaction_date", True)
    column_formatters = {
        SapOutward.quantity: lambda o, _a: _num(o.quantity),
        SapOutward.transaction_date: lambda o, _a: _dt(o.transaction_date),
    }
    page_size = 50


class OutwardStatusMasterAdmin(ModelView, model=OutwardStatusMaster):
    name = "Outward Status"
    name_plural = "Outward Status Master"
    column_list = [
        OutwardStatusMaster.code,
        OutwardStatusMaster.label,
        OutwardStatusMaster.sort_order,
        OutwardStatusMaster.is_default,
        OutwardStatusMaster.is_dispatched,
        OutwardStatusMaster.status,
    ]
    column_searchable_list = [OutwardStatusMaster.code, OutwardStatusMaster.label]
    column_default_sort = ("sort_order", False)
    page_size = 50


class SapOutwardStatusAdmin(ModelView, model=SapOutwardStatus):
    name = "SAP Outward Status"
    name_plural = "SAP Outward Statuses"
    column_list = [
        SapOutwardStatus.sap_outward_id,
        SapOutwardStatus.status,
        SapOutwardStatus.note,
        SapOutwardStatus.updated_at,
    ]
    column_searchable_list = [SapOutwardStatus.status]
    column_default_sort = ("updated_at", True)
    column_formatters = {
        SapOutwardStatus.updated_at: lambda o, _a: _dt(o.updated_at),
    }
    page_size = 50


def init_admin(app: FastAPI) -> None:
    admin = Admin(
        app,
        engine=engine,
        base_url=ADMIN_BASE_URL,
        title="Masterdata DB Admin",
        authentication_backend=_Auth(secret_key=settings.SECRET_KEY),
    )
    for view in (
        MasterModelAdmin,
        PlatingColorAdmin,
        VendorAdmin,
        LocationAdmin,
        TrayAdmin,
        BoxAdmin,
        SapOutwardAdmin,
        OutwardStatusMasterAdmin,
        SapOutwardStatusAdmin,
    ):
        admin.add_view(view)
