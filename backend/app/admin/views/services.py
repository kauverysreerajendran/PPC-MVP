"""Admin views for the tables owned by the sap / masterdata / rack services.

Those services keep their tables in dedicated PostgreSQL schemas inside the SAME
database this app connects to (`POSTGRES_DB`), so one panel can serve all of
them — see `.env` and `infrastructure/postgres/init/02-service-schemas.sql`.

Their SQLAlchemy models are NOT imported here, deliberately. Each service is a
separate deployable whose package is also called `app`
(`services/masterdata/app/models.py`, `services/rack/app/models.py`, …), so
importing three of them alongside `backend/app` is impossible without sys.path
surgery. Instead the tables are reflected from the live database at startup,
which has a second benefit: this panel cannot drift from a migration, because it
reads whatever the schema actually is.

If the database is unreachable at startup the reflection is skipped with a
warning and the panel still serves the `public` tables — starting the app must
never depend on this.
"""

from __future__ import annotations

import types
from decimal import Decimal
from typing import Any

from sqlalchemy import MetaData, create_engine
from sqlalchemy.ext.automap import automap_base

from app.admin.permissions import BaseAdminView
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("app.admin.services")

#: alembic bookkeeping — never exposed in the UI
_SKIP_TABLES = {"alembic_version"}


def _num(value: object) -> str:
    """467.000 -> '467', 467.5 -> '467.5'. Mirrors the service panels."""
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return str(int(value) if value == value.to_integral_value() else value.normalize())
    return str(value)


def _dt(value: object) -> str:
    return value.strftime("%Y-%m-%d %H:%M") if value is not None else ""


def _fmt_num(col: str):
    return lambda obj, _a: _num(getattr(obj, col, None))


def _fmt_dt(col: str):
    return lambda obj, _a: _dt(getattr(obj, col, None))


# --- what to show, per table -------------------------------------------------
# Column lists mirror the service-owned panels so nothing an operator is used to
# disappears:
#   services/sap-integration/app/admin.py
#   services/masterdata/app/admin.py
#   services/rack/app/admin.py
#
# schema -> table -> view configuration
_VIEWS: dict[str, dict[str, dict[str, Any]]] = {
    "sap": {
        "sap_inward_record": {
            "name": "Inward Record",
            "name_plural": "Inward Records",
            "category": "SAP",
            "icon": "fa-solid fa-file-import",
            "columns": [
                "sap_reference_id", "transaction_date", "dc_no", "po_no", "material_no",
                "model_no", "vendor_name", "quantity", "movement_type", "remark",
            ],
            "searchable": ["sap_reference_id", "dc_no", "po_no", "material_no", "vendor_name"],
            "sort": ("transaction_date", True),
            "numeric": ["quantity"],
            "dates": ["transaction_date"],
        },
        "sap_sync_run": {
            "name": "Sync Run",
            "name_plural": "Sync Runs",
            "category": "SAP",
            "icon": "fa-solid fa-rotate",
            "columns": [
                "started_at", "finished_at", "status", "provider",
                "records_ingested", "triggered_by", "error",
            ],
            "sort": ("started_at", True),
            "dates": ["started_at", "finished_at"],
            # a sync run is a record of what happened — never hand-edited
            "read_only": True,
        },
    },
    "masterdata": {
        "sap_outwards": {
            "name": "SAP Outward",
            "name_plural": "SAP Outwards",
            "category": "SAP",
            "icon": "fa-solid fa-truck-ramp-box",
            "columns": [
                "sap_reference_id", "transaction_date", "dc_no", "po_no", "material_no",
                "model_no", "vendor_code", "box_uid", "tray_id", "tray_type", "no_of_trays",
                "front_case_trays", "back_case_trays", "outward_status", "quantity",
                "received_pieces", "received_qty", "inward_status", "outward_status_note",
                "movement_type", "status",
            ],
            "searchable": [
                "sap_reference_id", "dc_no", "po_no", "material_no",
                "vendor_code", "box_uid", "tray_id", "outward_status",
            ],
            "sort": ("transaction_date", True),
            "numeric": ["quantity", "received_qty"],
            "dates": ["transaction_date"],
        },
        "master_models": {
            "name": "Model",
            "name_plural": "Models",
            "category": "Master Data",
            "icon": "fa-solid fa-cubes",
            "columns": ["model_no", "model_name", "part", "uom", "status", "updated_at"],
            "searchable": ["model_no", "model_name"],
            "sort": ("model_no", False),
            "dates": ["updated_at"],
        },
        "vendors": {
            "name": "Vendor",
            "name_plural": "Vendors",
            "category": "Master Data",
            "icon": "fa-solid fa-industry",
            "columns": ["vendor_code", "vendor_name", "contact_email", "status", "updated_at"],
            "searchable": ["vendor_code", "vendor_name"],
            "sort": ("vendor_code", False),
            "dates": ["updated_at"],
        },
        "plating_colors": {
            "name": "Plating Color",
            "name_plural": "Plating Colors",
            "category": "Master Data",
            "icon": "fa-solid fa-palette",
            "columns": ["color_code", "color_name", "status", "updated_at"],
            "searchable": ["color_code", "color_name"],
            "sort": ("color_code", False),
            "dates": ["updated_at"],
        },
        "locations": {
            "name": "Location",
            "name_plural": "Locations",
            "category": "Master Data",
            "icon": "fa-solid fa-sitemap",
            "columns": [
                "location_code", "location_name", "location_type",
                "parent_location_id", "status",
            ],
            "searchable": ["location_code", "location_name"],
            "sort": ("location_code", False),
        },
        "trays": {
            "name": "Tray",
            "name_plural": "Trays",
            "category": "Master Data",
            "icon": "fa-solid fa-layer-group",
            "columns": [
                "tray_id", "box_id", "tray_type", "no_of_trays",
                "qty", "qty_capacity", "status", "updated_at",
            ],
            "searchable": ["tray_id", "box_id", "tray_type"],
            "sort": ("tray_id", False),
            "numeric": ["qty", "qty_capacity"],
            "dates": ["updated_at"],
        },
        "boxes": {
            "name": "Box",
            "name_plural": "Boxes",
            "category": "Master Data",
            "icon": "fa-solid fa-box",
            "columns": ["box_uid", "box_type", "status", "updated_at"],
            "searchable": ["box_uid", "box_type"],
            "sort": ("box_uid", False),
            "dates": ["updated_at"],
        },
        "outward_status_master": {
            "name": "Outward Status",
            "name_plural": "Outward Status Master",
            "category": "Master Data",
            "icon": "fa-solid fa-list-check",
            "columns": ["code", "label", "sort_order", "is_default", "is_dispatched", "status"],
            "searchable": ["code", "label"],
            "sort": ("sort_order", False),
        },
        "movement_type_master": {
            "name": "Movement Type",
            "name_plural": "Movement Type Master",
            "category": "Master Data",
            "icon": "fa-solid fa-arrows-turn-to-dots",
            "columns": ["code", "description", "sort_order", "status"],
            "searchable": ["code", "description"],
            "sort": ("sort_order", False),
        },
    },
    "rack": {
        "rack_master": {
            "name": "Rack Master",
            "name_plural": "Rack Masters",
            "category": "Rack",
            "icon": "fa-solid fa-warehouse",
            "columns": [
                "warehouse_code", "aisle_code", "rack_code", "position", "side",
                "shelf_count", "row_count", "tray_count", "status",
            ],
            "searchable": ["warehouse_code", "aisle_code", "rack_code"],
            "sort": ("position", False),
        },
        "rack": {
            "name": "Rack Slot",
            "name_plural": "Rack Slots",
            "category": "Rack",
            "icon": "fa-solid fa-grip",
            "columns": [
                "warehouse_code", "aisle_code", "rack_code", "shelf_no", "row_no", "tray_no",
                "location_name", "slot_state", "occupied_by_model", "qty", "lot_no",
                "sap_reference_id", "date_of_occupied", "status",
            ],
            "searchable": [
                "rack_code", "location_name", "occupied_by_model", "lot_no", "sap_reference_id",
            ],
            "sort": ("rack_code", False),
            "numeric": ["qty"],
            "dates": ["date_of_occupied"],
        },
    },
}


def _build_view(model: type, config: dict[str, Any]) -> type[BaseAdminView]:
    """Create a BaseAdminView subclass for one reflected table.

    `type()` cannot pass the `model=` class keyword SQLAdmin's `__init_subclass__`
    expects, hence `types.new_class`.
    """
    columns = [c for c in config["columns"] if hasattr(model, c)]
    formatters = {
        **{c: _fmt_num(c) for c in config.get("numeric", []) if hasattr(model, c)},
        **{c: _fmt_dt(c) for c in config.get("dates", []) if hasattr(model, c)},
    }

    namespace: dict[str, Any] = {
        "name": config["name"],
        "name_plural": config["name_plural"],
        "category": config["category"],
        "icon": config.get("icon", "fa-solid fa-table"),
        "column_list": columns,
        "column_details_list": [c.key for c in model.__table__.columns],
        "form_columns": [
            c.key for c in model.__table__.columns
            if c.key not in ("id", "created_at", "updated_at")
        ],
        "column_searchable_list": [
            c for c in config.get("searchable", []) if hasattr(model, c)
        ],
        "column_sortable_list": columns,
        "column_formatters": formatters,
        "page_size": 50,
        "always_read_only": config.get("read_only", False),
    }
    if config.get("sort"):
        namespace["column_default_sort"] = config["sort"]

    return types.new_class(
        f"{config['name_plural'].replace(' ', '')}Admin",
        (BaseAdminView,),
        {"model": model},
        lambda ns: ns.update(namespace),
    )


def build_service_views() -> list[type[BaseAdminView]]:
    """Reflect the service schemas and return one view class per known table.

    Returns an empty list — and logs a warning — if the database cannot be
    reached, so the panel degrades instead of blocking startup.
    """
    # Reflection needs a sync driver; the app's own engine is asyncpg.
    dsn = str(settings.DATABASE_URL).replace("+asyncpg", "+psycopg")
    views: list[type[BaseAdminView]] = []

    try:
        engine = create_engine(dsn, poolclass=None, pool_pre_ping=True)
    except Exception as exc:
        log.warning("admin_service_views_skipped", reason=str(exc))
        return views

    try:
        for schema, tables in _VIEWS.items():
            metadata = MetaData(schema=schema)
            try:
                metadata.reflect(
                    bind=engine,
                    schema=schema,
                    only=lambda name, _m, _t=tables: name in _t and name not in _SKIP_TABLES,
                )
            except Exception as exc:
                log.warning("admin_schema_reflect_failed", schema=schema, reason=str(exc))
                continue

            base = automap_base(metadata=metadata)
            base.prepare()

            for table_name, config in tables.items():
                model = getattr(base.classes, table_name, None)
                if model is None:
                    log.warning("admin_table_missing", schema=schema, table=table_name)
                    continue
                views.append(_build_view(model, config))
    finally:
        engine.dispose()

    log.info("admin_service_views_registered", count=len(views))
    return views
