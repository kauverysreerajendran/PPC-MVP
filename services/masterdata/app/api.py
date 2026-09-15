"""HTTP routes — mounted at ``/api/v1/masterdata``.

Every master resource exposes the same REST surface:

    GET    /<resource>            list (pagination + search + sort + status filter)
    POST   /<resource>            create
    GET    /<resource>/{id}       retrieve
    PUT    /<resource>/{id}       update
    DELETE /<resource>/{id}       soft delete (status -> inactive)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app import status_client
from app.crud import CrudRepository
from app.db import get_session
from app.errors import ConflictError, NotFoundError
from app.security import Principal, current_principal

Session = Annotated[AsyncSession, Depends(get_session)]
User = Annotated[Principal, Depends(current_principal)]

router = APIRouter()


# --- repositories --------------------------------------------------------
models_repo = CrudRepository(
    m.MasterModel,
    searchable=(m.MasterModel.model_no, m.MasterModel.model_name, m.MasterModel.part),
    sortable={
        "model_no": m.MasterModel.model_no,
        "model_name": m.MasterModel.model_name,
        "status": m.MasterModel.status,
        "created_at": m.MasterModel.created_at,
        "updated_at": m.MasterModel.updated_at,
    },
    unique_fields=("model_no",),
)
colors_repo = CrudRepository(
    m.PlatingColor,
    searchable=(m.PlatingColor.color_code, m.PlatingColor.color_name),
    sortable={
        "color_code": m.PlatingColor.color_code,
        "color_name": m.PlatingColor.color_name,
        "status": m.PlatingColor.status,
        "created_at": m.PlatingColor.created_at,
    },
    unique_fields=("color_code", "color_name"),
)
vendors_repo = CrudRepository(
    m.Vendor,
    searchable=(m.Vendor.vendor_code, m.Vendor.vendor_name, m.Vendor.contact_email),
    sortable={
        "vendor_code": m.Vendor.vendor_code,
        "vendor_name": m.Vendor.vendor_name,
        "status": m.Vendor.status,
        "created_at": m.Vendor.created_at,
    },
    unique_fields=("vendor_code",),
)
locations_repo = CrudRepository(
    m.Location,
    searchable=(m.Location.location_code, m.Location.location_name),
    sortable={
        "location_code": m.Location.location_code,
        "location_name": m.Location.location_name,
        "location_type": m.Location.location_type,
        "status": m.Location.status,
        "created_at": m.Location.created_at,
    },
    unique_fields=("location_code",),
)
outwards_repo = CrudRepository(
    m.SapOutward,
    searchable=(
        m.SapOutward.sap_reference_id,
        m.SapOutward.sap_document_no,
        m.SapOutward.dc_no,
        m.SapOutward.po_no,
        m.SapOutward.material_no,
        m.SapOutward.model_no,
        m.SapOutward.vendor_code,
        m.SapOutward.batch_no,
        m.SapOutward.lot_no,
        m.SapOutward.box_uid,
        m.SapOutward.tray_id,
        m.SapOutward.tray_type,
        m.SapOutward.outward_status,
    ),
    sortable={
        "transaction_date": m.SapOutward.transaction_date,
        "sap_reference_id": m.SapOutward.sap_reference_id,
        "po_no": m.SapOutward.po_no,
        "material_no": m.SapOutward.material_no,
        "quantity": m.SapOutward.quantity,
        "box_uid": m.SapOutward.box_uid,
        "tray_id": m.SapOutward.tray_id,
        "tray_type": m.SapOutward.tray_type,
        "no_of_trays": m.SapOutward.no_of_trays,
        "front_case_trays": m.SapOutward.front_case_trays,
        "back_case_trays": m.SapOutward.back_case_trays,
        "outward_status": m.SapOutward.outward_status,
        "created_at": m.SapOutward.created_at,
    },
    unique_fields=("sap_reference_id",),
    default_sort="transaction_date",
)
trays_repo = CrudRepository(
    m.Tray,
    searchable=(m.Tray.tray_id, m.Tray.box_id, m.Tray.tray_type),
    sortable={
        "tray_id": m.Tray.tray_id,
        "box_id": m.Tray.box_id,
        "tray_type": m.Tray.tray_type,
        "no_of_trays": m.Tray.no_of_trays,
        "qty": m.Tray.qty,
        "qty_capacity": m.Tray.qty_capacity,
        "status": m.Tray.status,
        "created_at": m.Tray.created_at,
        "updated_at": m.Tray.updated_at,
    },
    unique_fields=("tray_id",),
    default_sort="tray_id",
)
boxes_repo = CrudRepository(
    m.Box,
    searchable=(m.Box.box_uid, m.Box.box_type),
    sortable={
        "box_uid": m.Box.box_uid,
        "box_type": m.Box.box_type,
        "status": m.Box.status,
        "created_at": m.Box.created_at,
        "updated_at": m.Box.updated_at,
    },
    unique_fields=("box_uid",),
    default_sort="box_uid",
)


class ListParams:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        page_size: int = Query(25, ge=1, le=200),
        search: str | None = Query(None, description="case-insensitive contains match"),
        sort: str = Query("created_at"),
        direction: str = Query("desc", pattern="^(asc|desc)$"),
        status: s.Status | None = Query(None, description="filter by row status"),
        with_total: bool = Query(
            True,
            description="false = skip the COUNT(*) (lookup fetches); total then equals the page length",
        ),
    ) -> None:
        self.page = page
        self.page_size = page_size
        self.search = search
        self.sort = sort
        self.direction = direction
        self.status = status
        self.with_total = with_total


ListDep = Annotated[ListParams, Depends(ListParams)]


async def _page(
    repo: CrudRepository[Any],
    session: AsyncSession,
    p: ListParams,
    out: type,
    *,
    extra_filters: dict[str, Any] | None = None,
) -> dict:
    filters: dict[str, Any] = {"status": p.status, **(extra_filters or {})}
    rows, total = await repo.list(
        session,
        page=p.page,
        page_size=p.page_size,
        search=p.search,
        sort=p.sort,
        direction=p.direction,
        filters=filters,
        with_total=p.with_total,
    )
    return {
        "items": [out.model_validate(r) for r in rows],
        "total": total,
        "page": p.page,
        "page_size": p.page_size,
    }


# ============================ models =====================================
@router.get("/models", response_model=s.Page[s.MasterModelOut], tags=["models"])
async def list_models(session: Session, _u: User, p: ListDep) -> Any:
    return await _page(models_repo, session, p, s.MasterModelOut)


@router.post(
    "/models",
    response_model=s.MasterModelOut,
    status_code=status.HTTP_201_CREATED,
    tags=["models"],
)
async def create_model(payload: s.MasterModelCreate, session: Session, _u: User) -> Any:
    return s.MasterModelOut.model_validate(await models_repo.create(session, payload))


@router.get("/models/{obj_id}", response_model=s.MasterModelOut, tags=["models"])
async def get_model(obj_id: uuid.UUID, session: Session, _u: User) -> Any:
    return s.MasterModelOut.model_validate(await models_repo.get(session, obj_id))


@router.put("/models/{obj_id}", response_model=s.MasterModelOut, tags=["models"])
async def update_model(
    obj_id: uuid.UUID, payload: s.MasterModelUpdate, session: Session, _u: User
) -> Any:
    return s.MasterModelOut.model_validate(await models_repo.update(session, obj_id, payload))


@router.delete(
    "/models/{obj_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["models"]
)
async def delete_model(obj_id: uuid.UUID, session: Session, _u: User) -> None:
    await models_repo.soft_delete(session, obj_id)


# ======================== plating colors ================================
@router.get(
    "/plating-colors", response_model=s.Page[s.PlatingColorOut], tags=["plating-colors"]
)
async def list_plating_colors(session: Session, _u: User, p: ListDep) -> Any:
    return await _page(colors_repo, session, p, s.PlatingColorOut)


@router.post(
    "/plating-colors",
    response_model=s.PlatingColorOut,
    status_code=status.HTTP_201_CREATED,
    tags=["plating-colors"],
)
async def create_plating_color(
    payload: s.PlatingColorCreate, session: Session, _u: User
) -> Any:
    return s.PlatingColorOut.model_validate(await colors_repo.create(session, payload))


@router.get(
    "/plating-colors/{obj_id}", response_model=s.PlatingColorOut, tags=["plating-colors"]
)
async def get_plating_color(obj_id: uuid.UUID, session: Session, _u: User) -> Any:
    return s.PlatingColorOut.model_validate(await colors_repo.get(session, obj_id))


@router.put(
    "/plating-colors/{obj_id}", response_model=s.PlatingColorOut, tags=["plating-colors"]
)
async def update_plating_color(
    obj_id: uuid.UUID, payload: s.PlatingColorUpdate, session: Session, _u: User
) -> Any:
    return s.PlatingColorOut.model_validate(await colors_repo.update(session, obj_id, payload))


@router.delete(
    "/plating-colors/{obj_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["plating-colors"],
)
async def delete_plating_color(obj_id: uuid.UUID, session: Session, _u: User) -> None:
    await colors_repo.soft_delete(session, obj_id)


# ============================ vendors ===================================
@router.get("/vendors", response_model=s.Page[s.VendorOut], tags=["vendors"])
async def list_vendors(session: Session, _u: User, p: ListDep) -> Any:
    return await _page(vendors_repo, session, p, s.VendorOut)


@router.post(
    "/vendors",
    response_model=s.VendorOut,
    status_code=status.HTTP_201_CREATED,
    tags=["vendors"],
)
async def create_vendor(payload: s.VendorCreate, session: Session, _u: User) -> Any:
    return s.VendorOut.model_validate(await vendors_repo.create(session, payload))


@router.get("/vendors/{obj_id}", response_model=s.VendorOut, tags=["vendors"])
async def get_vendor(obj_id: uuid.UUID, session: Session, _u: User) -> Any:
    return s.VendorOut.model_validate(await vendors_repo.get(session, obj_id))


@router.put("/vendors/{obj_id}", response_model=s.VendorOut, tags=["vendors"])
async def update_vendor(
    obj_id: uuid.UUID, payload: s.VendorUpdate, session: Session, _u: User
) -> Any:
    return s.VendorOut.model_validate(await vendors_repo.update(session, obj_id, payload))


@router.delete(
    "/vendors/{obj_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["vendors"]
)
async def delete_vendor(obj_id: uuid.UUID, session: Session, _u: User) -> None:
    await vendors_repo.soft_delete(session, obj_id)


# =========================== locations ==================================
@router.get("/locations", response_model=s.Page[s.LocationOut], tags=["locations"])
async def list_locations(
    session: Session,
    _u: User,
    p: ListDep,
    location_type: s.LocationType | None = Query(None),
) -> Any:
    return await _page(
        locations_repo,
        session,
        p,
        s.LocationOut,
        extra_filters={"location_type": location_type},
    )


@router.get(
    "/locations/children", response_model=list[s.LocationOut], tags=["locations"]
)
async def list_location_children(
    session: Session,
    _u: User,
    parent_location_id: uuid.UUID | None = Query(
        None, description="omit for top-level (WAREHOUSE) nodes"
    ),
) -> Any:
    stmt = select(m.Location).order_by(m.Location.location_code.asc())
    stmt = stmt.where(
        m.Location.parent_location_id == parent_location_id
        if parent_location_id is not None
        else m.Location.parent_location_id.is_(None)
    )
    rows = (await session.scalars(stmt)).all()
    return [s.LocationOut.model_validate(r) for r in rows]


@router.post(
    "/locations",
    response_model=s.LocationOut,
    status_code=status.HTTP_201_CREATED,
    tags=["locations"],
)
async def create_location(payload: s.LocationCreate, session: Session, _u: User) -> Any:
    if payload.parent_location_id is not None:
        if await session.get(m.Location, payload.parent_location_id) is None:
            raise ConflictError("parent_location_id references a non-existent location")
    return s.LocationOut.model_validate(await locations_repo.create(session, payload))


@router.get("/locations/{obj_id}", response_model=s.LocationOut, tags=["locations"])
async def get_location(obj_id: uuid.UUID, session: Session, _u: User) -> Any:
    return s.LocationOut.model_validate(await locations_repo.get(session, obj_id))


@router.put("/locations/{obj_id}", response_model=s.LocationOut, tags=["locations"])
async def update_location(
    obj_id: uuid.UUID, payload: s.LocationUpdate, session: Session, _u: User
) -> Any:
    data = payload.model_dump(exclude_unset=True)
    if data.get("parent_location_id") is not None:
        if data["parent_location_id"] == obj_id:
            raise ConflictError("a location cannot be its own parent")
        if await session.get(m.Location, data["parent_location_id"]) is None:
            raise ConflictError("parent_location_id references a non-existent location")
    return s.LocationOut.model_validate(await locations_repo.update(session, obj_id, payload))


@router.delete(
    "/locations/{obj_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["locations"]
)
async def delete_location(obj_id: uuid.UUID, session: Session, _u: User) -> None:
    await locations_repo.soft_delete(session, obj_id)


# ========================== sap outwards ==============================
_FK_MAP = {
    "model_id": m.MasterModel,
    "vendor_id": m.Vendor,
    "plating_color_id": m.PlatingColor,
    "location_id": m.Location,
}


async def _validate_fks(session: AsyncSession, data: dict[str, Any]) -> None:
    for field, model in _FK_MAP.items():
        ref = data.get(field)
        if ref is not None and await session.get(model, ref) is None:
            raise ConflictError(f"{field} references a non-existent {model.__name__}")


async def _validate_master_refs(session: AsyncSession, data: dict[str, Any]) -> None:
    """vendor_code / box_uid / tray_id / tray_type must already exist in the
    masters — 'data not available in the master DB is not allowed'."""
    vendor_code = data.get("vendor_code")
    if vendor_code:
        vid = await session.scalar(
            select(m.Vendor.id).where(
                func.lower(m.Vendor.vendor_code) == vendor_code.lower(),
                m.Vendor.status == "active",
            )
        )
        if vid is None:
            raise ConflictError(
                f"vendor_code '{vendor_code}' is not registered in the Vendors master"
            )
        data.setdefault("vendor_id", vid)
    elif "vendor_code" in data:  # explicitly cleared
        data.setdefault("vendor_id", None)

    box_uid = data.get("box_uid")
    if box_uid:
        canonical = await session.scalar(
            select(m.Box.box_uid).where(
                func.lower(m.Box.box_uid) == box_uid.lower(), m.Box.status == "active"
            )
        )
        if canonical is None:
            raise ConflictError(f"box_uid '{box_uid}' is not registered in the Boxes master")
        # store the master's canonical spelling (Box UIDs are upper-case)
        data["box_uid"] = canonical

    tray_id = data.get("tray_id")
    if tray_id:
        row = await session.execute(
            select(m.Tray.tray_type).where(
                func.lower(m.Tray.tray_id) == tray_id.lower(), m.Tray.status == "active"
            )
        )
        found = row.first()
        if found is None:
            raise ConflictError(f"tray_id '{tray_id}' is not registered in the Trays master")
        # if the caller also set tray_type, it must match the tray's own type
        if data.get("tray_type") and found[0] and data["tray_type"] != found[0]:
            raise ConflictError(
                f"tray_type '{data['tray_type']}' does not match tray '{tray_id}' "
                f"(its type is '{found[0]}')"
            )
        data.setdefault("tray_type", found[0])

    tray_type = data.get("tray_type")
    if tray_type and not tray_id:
        exists = await session.scalar(
            select(m.Tray.id).where(
                func.lower(m.Tray.tray_type) == tray_type.lower(), m.Tray.status == "active"
            )
        )
        if exists is None:
            raise ConflictError(
                f"tray_type '{tray_type}' is not used by any tray in the Trays master"
            )


async def _assert_box_uid_unique(
    session: AsyncSession, box_uid: str | None, *, exclude_id: uuid.UUID | None = None
) -> None:
    """A Box UID can only be assigned to one outward line at a time."""
    if not box_uid:
        return
    stmt = select(m.SapOutward.sap_reference_id).where(
        func.lower(m.SapOutward.box_uid) == box_uid.lower()
    )
    if exclude_id is not None:
        stmt = stmt.where(m.SapOutward.id != exclude_id)
    other = await session.scalar(stmt)
    if other is not None:
        raise ConflictError(
            f"Box UID '{box_uid}' is already assigned to outward line {other} — "
            "duplicate not allowed. Scan a different box."
        )


def _assert_box_uid_not_locked(row: m.SapOutward, data: dict[str, Any]) -> None:
    """Once a dispatched line has a Box UID, that UID is frozen.

    Lines start DISPATCHED (revision 0021), so an empty Box UID must still be
    settable — only a UID already entered is locked.
    """
    if "box_uid" not in data:
        return
    if (
        row.box_uid
        and row.outward_status == "DISPATCHED"
        and (data.get("box_uid") or None) != row.box_uid
    ):
        raise ConflictError(
            "This outward line is already dispatched — its Box UID is locked."
        )


def _auto_outward_status(data: dict[str, Any]) -> str | None:
    """Decide the outward status implied by a write.

    Entering a valid, available Box UID dispatches the line automatically; that
    always wins over an explicit ``outward_status`` in the same request.
    """
    if data.get("box_uid"):
        return "DISPATCHED"
    return data.get("outward_status")


def _sync_outward_status(
    row: m.SapOutward,
    new_status: str,
    *,
    note: str | None = None,
) -> None:
    """Move the outward line's status, enforcing the one-way DISPATCHED rule.

    Before revision 0020 this upserted a 1:1 ``sap_outward_statuses`` row and
    mirrored the value onto ``sap_outwards.outward_status``. The two never
    disagreed, so the satellite table was folded in: the column is now the only
    copy and the note lives beside it.
    """
    if row.outward_status == "DISPATCHED" and new_status != "DISPATCHED":
        raise ConflictError("a dispatched outward line cannot change status")

    row.outward_status = new_status
    if note is not None:
        row.outward_status_note = note


@router.get(
    "/outward-status-master",
    response_model=list[s.OutwardStatusMasterOut],
    tags=["sap-outwards"],
)
async def list_outward_status_master(session: Session, _u: User) -> Any:
    """The outward-status lookup (NEW → 'Yet to Dispatch', DISPATCHED → 'Dispatched', …)."""
    rows = (
        await session.scalars(
            select(m.OutwardStatusMaster).order_by(m.OutwardStatusMaster.sort_order.asc())
        )
    ).all()
    return [s.OutwardStatusMasterOut.model_validate(r) for r in rows]


@router.get(
    "/movement-type-master",
    response_model=list[s.MovementTypeMasterOut],
    tags=["sap-outwards"],
)
async def list_movement_type_master(session: Session, _u: User) -> Any:
    """The SAP movement-type lookup (code → description) — used to explain the
    ``SAP`` column on the SAP Upload screen."""
    rows = (
        await session.scalars(
            select(m.MovementTypeMaster).order_by(m.MovementTypeMaster.sort_order.asc())
        )
    ).all()
    return [s.MovementTypeMasterOut.model_validate(r) for r in rows]


@router.get("/sap-outwards", response_model=s.Page[s.SapOutwardOut], tags=["sap-outwards"])
async def list_sap_outwards(
    session: Session,
    _u: User,
    p: ListDep,
    vendor_id: uuid.UUID | None = Query(None),
    model_id: uuid.UUID | None = Query(None),
    movement_type: str | None = Query(None),
    box_uid: str | None = Query(None),
    tray_id: str | None = Query(None),
    tray_type: str | None = Query(None),
    outward_status: str | None = Query(None),
    inward_status: str | None = Query(None),
) -> Any:
    return await _page(
        outwards_repo,
        session,
        p,
        s.SapOutwardOut,
        extra_filters={
            "vendor_id": vendor_id,
            "model_id": model_id,
            "movement_type": movement_type,
            "box_uid": box_uid,
            "tray_id": tray_id,
            "tray_type": tray_type,
            "outward_status": outward_status,
            "inward_status": inward_status,
        },
    )


@router.post(
    "/sap-outwards",
    response_model=s.SapOutwardOut,
    status_code=status.HTTP_201_CREATED,
    tags=["sap-outwards"],
)
async def create_sap_outward(
    payload: s.SapOutwardCreate, session: Session, _u: User
) -> Any:
    data = payload.model_dump(exclude_unset=True)
    await _validate_fks(session, data)
    await _validate_master_refs(session, data)
    await _assert_box_uid_unique(session, data.get("box_uid"))
    row = await outwards_repo.create(session, payload)
    # Every outward line starts with a status: lines arrive already dispatched.
    _sync_outward_status(row, _auto_outward_status(data) or "DISPATCHED")
    await session.flush()
    return s.SapOutwardOut.model_validate(row)


@router.get("/sap-outwards/{obj_id}", response_model=s.SapOutwardOut, tags=["sap-outwards"])
async def get_sap_outward(obj_id: uuid.UUID, session: Session, _u: User) -> Any:
    return s.SapOutwardOut.model_validate(await outwards_repo.get(session, obj_id))


@router.put("/sap-outwards/{obj_id}", response_model=s.SapOutwardOut, tags=["sap-outwards"])
async def update_sap_outward(
    obj_id: uuid.UUID, payload: s.SapOutwardUpdate, session: Session, _u: User
) -> Any:
    data = payload.model_dump(exclude_unset=True)
    await _validate_fks(session, data)
    await _validate_master_refs(session, data)
    _assert_box_uid_not_locked(await outwards_repo.get(session, obj_id), data)
    await _assert_box_uid_unique(session, data.get("box_uid"), exclude_id=obj_id)
    row = await outwards_repo.update(session, obj_id, payload)
    if (auto := _auto_outward_status(data)) is not None:
        _sync_outward_status(row, auto)
        await session.flush()
    return s.SapOutwardOut.model_validate(row)


@router.patch(
    "/sap-outwards/by-ref/{sap_reference_id}",
    response_model=s.SapOutwardOut,
    tags=["sap-outwards"],
)
async def patch_sap_outward_by_ref(
    sap_reference_id: str, payload: s.SapOutwardTxnPatch, session: Session, _u: User
) -> Any:
    """Edit the transaction fields (box/tray/status) of the outward row that
    matches a SAP reference — used by the SAP Upload screen."""
    row = await session.scalar(
        select(m.SapOutward).where(m.SapOutward.sap_reference_id == sap_reference_id)
    )
    if row is None:
        raise NotFoundError(f"sap_outward for reference '{sap_reference_id}'")
    data = payload.model_dump(exclude_unset=True)
    _assert_box_uid_not_locked(row, data)
    await _validate_master_refs(session, data)
    await _assert_box_uid_unique(session, data.get("box_uid"), exclude_id=row.id)
    for key, value in data.items():
        if key == "outward_status":
            continue  # status is derived, never set directly — see _sync_outward_status
        setattr(row, key, value)
    if (auto := _auto_outward_status(data)) is not None:
        _sync_outward_status(row, auto)
    await session.flush()
    return s.SapOutwardOut.model_validate(row)


@router.delete(
    "/sap-outwards/{obj_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["sap-outwards"]
)
async def delete_sap_outward(obj_id: uuid.UUID, session: Session, _u: User) -> None:
    await outwards_repo.soft_delete(session, obj_id)


# ========================== sap inward =================================
_INWARD_SEARCH = (
    m.SapOutward.box_uid,
    m.SapOutward.dc_no,
    m.SapOutward.po_no,
    m.SapOutward.model_no,
    m.SapOutward.batch_no,
    m.SapOutward.lot_no,
    m.SapOutward.sap_reference_id,
)


@router.get(
    "/sap-inward/lines", response_model=s.Page[s.SapOutwardOut], tags=["sap-inward"]
)
async def list_sap_inward_lines(
    session: Session,
    _u: User,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
    inward_status: str | None = Query(None),
) -> Any:
    """Only the outward lines that a Box UID has actually been scanned against
    (i.e. receiving has started). The SAP Inward grid stays empty until then."""
    stmt = select(m.SapOutward).where(
        m.SapOutward.status == "active",
        or_(
            m.SapOutward.received_pieces > 0,
            m.SapOutward.inward_status.is_not(None),
        ),
    )
    if inward_status:
        stmt = stmt.where(m.SapOutward.inward_status == inward_status)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(*(c.ilike(like) for c in _INWARD_SEARCH)))

    total = await session.scalar(
        select(func.count()).select_from(stmt.subquery())
    ) or 0
    stmt = (
        stmt.order_by(m.SapOutward.inward_last_scan_at.desc().nullslast())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    rows = (await session.scalars(stmt)).all()
    return {
        "items": [s.SapOutwardOut.model_validate(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def _scan_out(sap_outward_id: uuid.UUID, scan: dict[str, Any]) -> s.SapInwardScanOut:
    """One entry of ``sap_outwards.inward_scans`` in the wire shape the API has
    always returned. ``sap_outward_id`` is the parent's id — it used to be a
    stored FK column before revision 0020 folded the table in."""
    return s.SapInwardScanOut.model_validate({**scan, "sap_outward_id": sap_outward_id})


def _recompute_inward(row: m.SapOutward) -> None:
    """Roll the running receiving tally up onto the outward line."""
    if s.qty_entries(row.inward_scans):
        # Entered quantities: received_qty is the accepted qty the operator
        # entered — keep it (the piece count was derived from it, not the other
        # way round). Accounted for in full only when accepted + rejected = lot.
        rejected = s.qty_entry_total(row.inward_scans, "rejected_qty")
        accounted = (row.received_qty or Decimal(0)) + rejected
        row.inward_status = (
            "RECEIVED"
            if row.quantity is not None and accounted == row.quantity
            else "PARTIAL"
        )
        return
    out = s.SapOutwardOut.model_validate(row)
    expected = out.expected_pieces
    pieces = int(row.received_pieces or 0)
    if row.quantity is not None:
        # Whole parts only — never a fractional share of the lot.
        row.received_qty = s.received_qty_for(row.quantity, expected, pieces)
    if pieces == 0:
        row.inward_status = "PENDING"
    elif pieces < expected:
        row.inward_status = "PARTIAL"
    elif pieces == expected:
        row.inward_status = "RECEIVED"
    else:
        row.inward_status = "OVER"


@router.post(
    "/sap-inward/scan",
    response_model=s.SapInwardScanResult,
    tags=["sap-inward"],
)
async def sap_inward_scan(
    payload: s.SapInwardScanIn, session: Session, user: User
) -> Any:
    """Register one received front+back piece for the outward line that carries
    this Box UID. PO / DC, if supplied, must match that line."""
    box = payload.box_uid.strip()
    row = await session.scalar(
        select(m.SapOutward)
        .where(m.SapOutward.box_uid == box, m.SapOutward.status == "active")
        .limit(1)
    )
    if row is None:
        return s.SapInwardScanResult(
            matched=False, message=f"No outward line for Box UID '{box}'."
        )
    if payload.po_no and row.po_no and payload.po_no.strip() != row.po_no:
        return s.SapInwardScanResult(
            matched=False,
            message=f"Box '{box}' belongs to PO {row.po_no}, not {payload.po_no.strip()}.",
        )
    if payload.dc_no and row.dc_no and payload.dc_no.strip() != row.dc_no:
        return s.SapInwardScanResult(
            matched=False,
            message=f"Box '{box}' belongs to DC {row.dc_no}, not {payload.dc_no.strip()}.",
        )

    if payload.accepted_qty is not None:
        return await _record_qty_entry(row, payload, box, session, user)

    expected = s.SapOutwardOut.model_validate(row).expected_pieces
    piece_no = int(row.received_pieces or 0) + 1
    per = s.piece_qty(row.quantity, expected, piece_no)
    scanned_at = datetime.now(UTC)
    scan = {
        "id": str(uuid.uuid4()),
        "box_uid": box,
        "po_no": row.po_no,
        "dc_no": row.dc_no,
        "piece_no": piece_no,
        "qty": str(per) if per is not None else None,
        "scanned_by": user.subject or None,
        "scanned_at": scanned_at.isoformat(),
    }
    # Replace the list, never append in place: a plain JSONB column has no
    # mutation tracking, so an in-place append would never be flushed.
    row.inward_scans = [*(row.inward_scans or []), scan]
    row.received_pieces = piece_no
    row.inward_last_scan_at = scanned_at
    _recompute_inward(row)
    await session.flush()

    # A scanned box moves the line on in the Status service: outward → Received
    # (it leaves SAP Outward's open list) and inward → Yet to verify — again, if
    # more pieces arrive after a Verify. Repeats are no-ops there. If the Status
    # service refuses, this request fails and the scan above rolls back.
    await status_client.report(
        [
            status_client.event(
                row.sap_reference_id, "outward", "RECEIVED", actor=user.subject or None
            ),
            status_client.event(
                row.sap_reference_id,
                "inward",
                "YET_TO_VERIFY",
                actor=user.subject or None,
                note=f"piece {piece_no}/{expected} scanned",
            ),
        ]
    )

    out = s.SapOutwardOut.model_validate(row)
    over = piece_no > expected
    msg = (
        f"{row.model_no or 'lot'} · piece {piece_no}/{expected}"
        + (" — OVER expected!" if over else "")
        + (
            f" · received {out.received_qty} of {row.quantity}"
            f" · shortage {out.shortage_qty}"
            if row.quantity is not None
            else ""
        )
    )
    return s.SapInwardScanResult(
        matched=True,
        message=msg,
        scan=_scan_out(row.id, scan),
        outward=out,
    )


async def _record_qty_entry(
    row: m.SapOutward,
    payload: s.SapInwardScanIn,
    box: str,
    session: AsyncSession,
    user: Principal,
) -> s.SapInwardScanResult:
    """Record the accepted / QED-rejected quantities for the whole line.

    The quantities come from the vendor mail / QED sheet. Accepted splits
    equally into front and back cases and is the received quantity; shortage
    is lot − accepted − rejected. The piece-based parts of the app (receiving
    status, rack placement one piece per tray) still need a piece count, so
    ``received_pieces`` is derived with :func:`schemas.pieces_for_accepted`:
    ``ceil(accepted / qty_per_piece)``, min 1, max ``expected_pieces``.
    One entry per line — a second one is refused until the line is Reset.
    """
    if row.quantity is None:
        raise ConflictError(
            f"Box '{box}' has no lot quantity, so the accepted qty cannot be checked. "
            "Scan the pieces instead."
        )
    if s.qty_entries(row.inward_scans):
        raise ConflictError(
            f"The accepted qty for box '{box}' is already recorded. "
            "Reset the line on SAP Inward to enter it again."
        )
    accepted = payload.accepted_qty or Decimal(0)
    rejected = payload.rejected_qty or Decimal(0)
    if accepted + rejected > row.quantity:
        raise ConflictError(
            f"Accepted {s._clean_number(accepted)} + rejected {s._clean_number(rejected)} "
            f"is more than the lot qty {s._clean_number(row.quantity)}. "
            "Check the vendor mail / QED sheet and enter it again."
        )

    expected = s.SapOutwardOut.model_validate(row).expected_pieces
    pieces = s.pieces_for_accepted(row.quantity, expected, accepted)
    half = accepted / 2
    scanned_at = datetime.now(UTC)
    entry = {
        "id": str(uuid.uuid4()),
        "box_uid": box,
        "po_no": row.po_no,
        "dc_no": row.dc_no,
        "piece_no": pieces,
        "qty": str(accepted),
        "scanned_by": user.subject or None,
        "scanned_at": scanned_at.isoformat(),
        "accepted_qty": str(accepted),
        "rejected_qty": str(rejected),
        "front_cases": str(half),
        "back_cases": str(half),
        "entry_mode": s.QTY_ENTRY,
    }
    # Replace the list, never mutate in place (see sap_inward_scan).
    row.inward_scans = [*(row.inward_scans or []), entry]
    row.received_pieces = pieces
    row.received_qty = accepted
    row.inward_last_scan_at = scanned_at
    _recompute_inward(row)
    await session.flush()

    out = s.SapOutwardOut.model_validate(row)
    n = s._clean_number
    await status_client.report(
        [
            status_client.event(
                row.sap_reference_id, "outward", "RECEIVED", actor=user.subject or None
            ),
            status_client.event(
                row.sap_reference_id,
                "inward",
                "YET_TO_VERIFY",
                actor=user.subject or None,
                note=(
                    f"accepted {n(accepted)} ({n(half)}F/{n(half)}B) · rejected {n(rejected)}"
                    f" · shortage {out.shortage_qty} of {n(row.quantity)}"
                ),
            ),
        ]
    )
    return s.SapInwardScanResult(
        matched=True,
        message=(
            f"{row.model_no or 'lot'} · accepted {n(accepted)} "
            f"({n(half)} front / {n(half)} back) · rejected {n(rejected)}"
            f" · shortage {out.shortage_qty} of {n(row.quantity)}"
        ),
        scan=_scan_out(row.id, entry),
        outward=out,
    )


@router.post(
    "/sap-inward/{obj_id}/close",
    response_model=s.SapOutwardOut,
    tags=["sap-inward"],
)
async def sap_inward_close(
    obj_id: uuid.UUID, payload: s.SapInwardCloseIn, session: Session, _u: User
) -> Any:
    """Finalise receiving: RECEIVED if all pieces are in, else SHORT."""
    row = await outwards_repo.get(session, obj_id)
    expected = s.SapOutwardOut.model_validate(row).expected_pieces
    row.inward_status = (
        "RECEIVED" if int(row.received_pieces or 0) >= expected else "SHORT"
    )
    await session.flush()
    return s.SapOutwardOut.model_validate(row)


@router.post(
    "/sap-inward/{obj_id}/reset",
    response_model=s.SapOutwardOut,
    tags=["sap-inward"],
)
async def sap_inward_reset(obj_id: uuid.UUID, session: Session, user: User) -> Any:
    """Wipe the receiving tally and every scan for this line — and put its
    statuses back: outward → Dispatched, inward → Not received."""
    row = await outwards_repo.get(session, obj_id)
    row.inward_scans = []
    row.received_pieces = 0
    row.received_qty = None
    row.inward_status = None
    row.inward_last_scan_at = None
    await session.flush()
    await status_client.report(
        [
            status_client.event(
                row.sap_reference_id,
                "outward",
                "DISPATCHED",
                actor=user.subject or None,
                note="receiving reset",
            ),
            status_client.event(
                row.sap_reference_id,
                "inward",
                "NOT_RECEIVED",
                actor=user.subject or None,
                note="receiving reset",
            ),
        ]
    )
    return s.SapOutwardOut.model_validate(row)


# Status service stores the event note as String(255).
_STATUS_NOTE_MAX = 255


@router.post(
    "/sap-inward/{obj_id}/verify",
    response_model=s.StatusLineOut,
    tags=["sap-inward"],
)
async def sap_inward_verify(
    obj_id: uuid.UUID,
    session: Session,
    user: User,
    payload: s.SapInwardVerifyIn | None = None,
) -> Any:
    """The operator checked the received quantities: inward status → Verified.

    With a body, the four inward receipts confirmed in the Verify window are
    appended to the Status-service note; without one the note is unchanged.
    Scanning more pieces afterwards moves the line back to Yet to verify."""
    row = await outwards_repo.get(session, obj_id)
    if not row.received_pieces:
        raise ConflictError("Nothing has been received on this line yet — scan a box first.")
    out = s.SapOutwardOut.model_validate(row)
    note = (
        f"{row.received_pieces}/{out.expected_pieces} pieces · "
        f"received {out.received_qty} of {out.quantity}"
    )
    if payload is not None:
        suffix = " · docs: " + " ".join(f"{tag} ✓" for tag in s.INWARD_DOCUMENTS.values())
        note = note[: _STATUS_NOTE_MAX - len(suffix)] + suffix
    changes = await status_client.report(
        [
            status_client.event(
                row.sap_reference_id,
                "inward",
                "VERIFIED",
                actor=user.subject or None,
                note=note,
            )
        ]
    )
    return changes[0]["line"]


@router.get(
    "/sap-inward/{obj_id}/scans",
    response_model=list[s.SapInwardScanOut],
    tags=["sap-inward"],
)
async def sap_inward_scans(obj_id: uuid.UUID, session: Session, _u: User) -> Any:
    row = await outwards_repo.get(session, obj_id)
    scans = sorted(row.inward_scans or [], key=lambda sc: sc.get("piece_no") or 0)
    return [_scan_out(row.id, sc) for sc in scans]


# ============================= trays ====================================
@router.get("/trays", response_model=s.Page[s.TrayOut], tags=["trays"])
async def list_trays(
    session: Session,
    _u: User,
    p: ListDep,
    tray_type: str | None = Query(None),
    box_id: str | None = Query(None),
) -> Any:
    return await _page(
        trays_repo,
        session,
        p,
        s.TrayOut,
        extra_filters={"tray_type": tray_type, "box_id": box_id},
    )


@router.post(
    "/trays",
    response_model=s.TrayOut,
    status_code=status.HTTP_201_CREATED,
    tags=["trays"],
)
async def create_tray(payload: s.TrayCreate, session: Session, _u: User) -> Any:
    return s.TrayOut.model_validate(await trays_repo.create(session, payload))


@router.get("/trays/{obj_id}", response_model=s.TrayOut, tags=["trays"])
async def get_tray(obj_id: uuid.UUID, session: Session, _u: User) -> Any:
    return s.TrayOut.model_validate(await trays_repo.get(session, obj_id))


@router.put("/trays/{obj_id}", response_model=s.TrayOut, tags=["trays"])
async def update_tray(
    obj_id: uuid.UUID, payload: s.TrayUpdate, session: Session, _u: User
) -> Any:
    return s.TrayOut.model_validate(await trays_repo.update(session, obj_id, payload))


@router.delete(
    "/trays/{obj_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["trays"]
)
async def delete_tray(obj_id: uuid.UUID, session: Session, _u: User) -> None:
    await trays_repo.soft_delete(session, obj_id)


# ============================= boxes ====================================
@router.get("/boxes", response_model=s.Page[s.BoxOut], tags=["boxes"])
async def list_boxes(
    session: Session, _u: User, p: ListDep, box_type: str | None = Query(None)
) -> Any:
    return await _page(
        boxes_repo, session, p, s.BoxOut, extra_filters={"box_type": box_type}
    )


@router.post(
    "/boxes",
    response_model=s.BoxOut,
    status_code=status.HTTP_201_CREATED,
    tags=["boxes"],
)
async def create_box(payload: s.BoxCreate, session: Session, _u: User) -> Any:
    return s.BoxOut.model_validate(await boxes_repo.create(session, payload))


@router.get("/boxes/{obj_id}", response_model=s.BoxOut, tags=["boxes"])
async def get_box(obj_id: uuid.UUID, session: Session, _u: User) -> Any:
    return s.BoxOut.model_validate(await boxes_repo.get(session, obj_id))


@router.put("/boxes/{obj_id}", response_model=s.BoxOut, tags=["boxes"])
async def update_box(
    obj_id: uuid.UUID, payload: s.BoxUpdate, session: Session, _u: User
) -> Any:
    return s.BoxOut.model_validate(await boxes_repo.update(session, obj_id, payload))


@router.delete(
    "/boxes/{obj_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["boxes"]
)
async def delete_box(obj_id: uuid.UUID, session: Session, _u: User) -> None:
    await boxes_repo.soft_delete(session, obj_id)
