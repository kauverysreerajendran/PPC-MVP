"""HTTP routes — mounted at ``/api/v1/rack``.

Physical topology master (upload the rack chart here first — everything else is
derived from it):

    GET    /masters                     list rack masters
    POST   /masters                     register a physical rack (auto-materialises)
    GET    /masters/{id}                retrieve
    PUT    /masters/{id}                update shape (auto-materialises)
    DELETE /masters/{id}                soft delete
    POST   /masters/{id}/materialize    (re)derive this rack's tray slots
    POST   /masters/materialize         (re)derive every active rack

Derived views the Rack Locator renders:

    GET    /topology                    warehouse -> aisle -> rack + occupancy
    GET    /racks/{rack_code}           one rack -> shelf -> row -> tray
    GET    /locate                      backend-ranked empty locations
    GET    /resolve                     "K-S4-R2-T05" / a model_no -> exact slot

Slot occupancy:

    GET    /slots                       list (pagination + search + sort + filters)
    POST   /slots                       create a physical slot
    GET    /slots/{id}                  retrieve
    PUT    /slots/{id}                  update
    DELETE /slots/{id}                  soft delete (status -> inactive)
    POST   /slots/{id}/occupy           dynamically place a model in the slot
    POST   /slots/{id}/release          free the slot
    POST   /slots/{id}/state            reserve / block / un-reserve a free slot
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app import topology as t
from app.crud import CrudRepository
from app.db import get_session
from app.errors import ConflictError
from app.masterdata_client import model_exists
from app.security import Principal, current_principal

Session = Annotated[AsyncSession, Depends(get_session)]
User = Annotated[Principal, Depends(current_principal)]

router = APIRouter()

masters_repo = CrudRepository(
    m.RackMaster,
    searchable=(
        m.RackMaster.warehouse_code,
        m.RackMaster.aisle_code,
        m.RackMaster.rack_code,
        m.RackMaster.rack_name,
        m.RackMaster.notes,
    ),
    sortable={
        "warehouse_code": m.RackMaster.warehouse_code,
        "aisle_code": m.RackMaster.aisle_code,
        "rack_code": m.RackMaster.rack_code,
        "position": m.RackMaster.position,
        "shelf_count": m.RackMaster.shelf_count,
        "row_count": m.RackMaster.row_count,
        "tray_count": m.RackMaster.tray_count,
        "status": m.RackMaster.status,
        "created_at": m.RackMaster.created_at,
        "updated_at": m.RackMaster.updated_at,
    },
    unique_fields=(),  # composite uniqueness enforced by the DB constraint
    default_sort="position",
)

slots_repo = CrudRepository(
    m.Rack,
    searchable=(
        m.Rack.rack_code,
        m.Rack.location_name,
        m.Rack.occupied_by_model,
        m.Rack.notes,
    ),
    sortable={
        "rack_code": m.Rack.rack_code,
        "warehouse_code": m.Rack.warehouse_code,
        "aisle_code": m.Rack.aisle_code,
        "shelf_no": m.Rack.shelf_no,
        "row_no": m.Rack.row_no,
        "tray_no": m.Rack.tray_no,
        "occupied": m.Rack.occupied,
        "slot_state": m.Rack.slot_state,
        "occupied_by_model": m.Rack.occupied_by_model,
        "date_of_occupied": m.Rack.date_of_occupied,
        "status": m.Rack.status,
        "created_at": m.Rack.created_at,
        "updated_at": m.Rack.updated_at,
    },
    unique_fields=(),
    default_sort="rack_code",
)


# --- rack master ------------------------------------------------------------
class MasterListParams:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=200),
        search: str | None = Query(None, description="case-insensitive contains match"),
        sort: str = Query("position"),
        direction: str = Query("asc", pattern="^(asc|desc)$"),
        status: s.Status | None = Query(None),
        warehouse_code: str | None = Query(None),
        aisle_code: str | None = Query(None),
        rack_code: str | None = Query(None),
    ) -> None:
        self.page = page
        self.page_size = page_size
        self.search = search
        self.sort = sort
        self.direction = direction
        self.status = status
        self.warehouse_code = warehouse_code
        self.aisle_code = aisle_code
        self.rack_code = rack_code


MasterListDep = Annotated[MasterListParams, Depends(MasterListParams)]


@router.get("/masters", response_model=s.Page[s.RackMasterOut], tags=["rack-master"])
async def list_masters(session: Session, _u: User, p: MasterListDep) -> Any:
    rows, total = await masters_repo.list(
        session,
        page=p.page,
        page_size=p.page_size,
        search=p.search,
        sort=p.sort,
        direction=p.direction,
        filters={
            "status": p.status,
            "warehouse_code": p.warehouse_code,
            "aisle_code": p.aisle_code,
            "rack_code": p.rack_code,
        },
    )
    return {
        "items": [s.RackMasterOut.model_validate(r) for r in rows],
        "total": total,
        "page": p.page,
        "page_size": p.page_size,
    }


@router.post(
    "/masters",
    response_model=s.RackMasterOut,
    status_code=status.HTTP_201_CREATED,
    tags=["rack-master"],
)
async def create_master(
    payload: s.RackMasterCreate,
    session: Session,
    _u: User,
    materialize: bool = Query(True, description="derive tray slots immediately"),
) -> Any:
    master = await masters_repo.create(session, payload)
    if materialize:
        await t.materialize(session, master)
    return s.RackMasterOut.model_validate(master)


@router.get("/masters/{obj_id}", response_model=s.RackMasterOut, tags=["rack-master"])
async def get_master(obj_id: uuid.UUID, session: Session, _u: User) -> Any:
    return s.RackMasterOut.model_validate(await masters_repo.get(session, obj_id))


@router.put("/masters/{obj_id}", response_model=s.RackMasterOut, tags=["rack-master"])
async def update_master(
    obj_id: uuid.UUID,
    payload: s.RackMasterUpdate,
    session: Session,
    _u: User,
    materialize: bool = Query(True, description="re-derive tray slots after the change"),
) -> Any:
    master = await masters_repo.update(session, obj_id, payload)
    if materialize and master.status == "active":
        await t.materialize(session, master)
    return s.RackMasterOut.model_validate(master)


@router.delete(
    "/masters/{obj_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["rack-master"]
)
async def delete_master(obj_id: uuid.UUID, session: Session, _u: User) -> None:
    await masters_repo.soft_delete(session, obj_id)


@router.post(
    "/masters/materialize", response_model=list[s.MaterializeOut], tags=["rack-master"]
)
async def materialize_all(session: Session, _u: User) -> Any:
    return [
        await t.materialize(session, master)
        for master in await t.active_masters(session)
    ]


@router.post(
    "/masters/{obj_id}/materialize", response_model=s.MaterializeOut, tags=["rack-master"]
)
async def materialize_one(obj_id: uuid.UUID, session: Session, _u: User) -> Any:
    return await t.materialize(session, await masters_repo.get(session, obj_id))


# --- derived views ----------------------------------------------------------
@router.get("/topology", response_model=s.TopologyOut, tags=["rack-locator"])
async def get_topology(
    session: Session,
    _u: User,
    warehouse_code: str | None = Query(None),
    aisle_code: str | None = Query(None),
) -> Any:
    return await t.build_topology(
        session, warehouse_code=warehouse_code, aisle_code=aisle_code
    )


@router.get("/racks/{rack_code}", response_model=s.RackDetailOut, tags=["rack-locator"])
async def get_rack_detail(
    rack_code: str,
    warehouse_code: Annotated[str, Query(...)],
    aisle_code: Annotated[str, Query(...)],
    session: Session,
    _u: User,
) -> Any:
    return await t.rack_detail(session, warehouse_code, aisle_code, rack_code)


@router.get("/locate", response_model=s.LocateOut, tags=["rack-locator"])
async def locate_empty(
    session: Session,
    _u: User,
    warehouse_code: str | None = Query(None),
    aisle_code: str | None = Query(None),
    rack_code: str | None = Query(None),
    limit: int = Query(5, ge=1, le=50),
) -> Any:
    return await t.locate(
        session,
        warehouse_code=warehouse_code,
        aisle_code=aisle_code,
        rack_code=rack_code,
        limit=limit,
    )


@router.get("/resolve", response_model=s.ResolveOut, tags=["rack-locator"])
async def resolve_location(
    session: Session,
    _u: User,
    q: Annotated[str, Query(min_length=1, max_length=64)],
    warehouse_code: str | None = Query(None),
    aisle_code: str | None = Query(None),
) -> Any:
    return await t.resolve_code(
        session, q, warehouse_code=warehouse_code, aisle_code=aisle_code
    )


# --- slots ------------------------------------------------------------------
class ListParams:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        page_size: int = Query(25, ge=1, le=200),
        search: str | None = Query(None, description="case-insensitive contains match"),
        sort: str = Query("rack_code"),
        direction: str = Query("asc", pattern="^(asc|desc)$"),
        status: s.Status | None = Query(None, description="filter by row status"),
        warehouse_code: str | None = Query(None),
        aisle_code: str | None = Query(None),
        rack_code: str | None = Query(None),
        slot_state: s.SlotState | None = Query(None),
        occupied: bool | None = Query(None),
        occupied_by_model: str | None = Query(None),
    ) -> None:
        self.page = page
        self.page_size = page_size
        self.search = search
        self.sort = sort
        self.direction = direction
        self.status = status
        self.warehouse_code = warehouse_code
        self.aisle_code = aisle_code
        self.rack_code = rack_code
        self.slot_state = slot_state
        self.occupied = occupied
        self.occupied_by_model = occupied_by_model


ListDep = Annotated[ListParams, Depends(ListParams)]


@router.get("/slots", response_model=s.Page[s.RackOut], tags=["rack"])
async def list_slots(session: Session, _u: User, p: ListDep) -> Any:
    rows, total = await slots_repo.list(
        session,
        page=p.page,
        page_size=p.page_size,
        search=p.search,
        sort=p.sort,
        direction=p.direction,
        filters={
            "status": p.status,
            "warehouse_code": p.warehouse_code,
            "aisle_code": p.aisle_code,
            "rack_code": p.rack_code,
            "slot_state": p.slot_state,
            "occupied": p.occupied,
            "occupied_by_model": p.occupied_by_model,
        },
    )
    return {
        "items": [s.RackOut.model_validate(r) for r in rows],
        "total": total,
        "page": p.page,
        "page_size": p.page_size,
    }


@router.post(
    "/slots",
    response_model=s.RackOut,
    status_code=status.HTTP_201_CREATED,
    tags=["rack"],
)
async def create_slot(payload: s.RackCreate, session: Session, _u: User) -> Any:
    if payload.occupied and payload.occupied_by_model:
        await _assert_model_known(payload.occupied_by_model)
    return s.RackOut.model_validate(await slots_repo.create(session, payload))


@router.get("/slots/{obj_id}", response_model=s.RackOut, tags=["rack"])
async def get_slot(obj_id: uuid.UUID, session: Session, _u: User) -> Any:
    return s.RackOut.model_validate(await slots_repo.get(session, obj_id))


@router.put("/slots/{obj_id}", response_model=s.RackOut, tags=["rack"])
async def update_slot(
    obj_id: uuid.UUID, payload: s.RackUpdate, session: Session, _u: User
) -> Any:
    data = payload.model_dump(exclude_unset=True)
    if data.get("occupied_by_model"):
        await _assert_model_known(data["occupied_by_model"])
    slot = await slots_repo.update(session, obj_id, payload)
    if "occupied" in data:  # keep the two occupancy columns in step
        slot.slot_state = "occupied" if slot.occupied else "empty"
        await session.flush()
    return s.RackOut.model_validate(slot)


@router.delete(
    "/slots/{obj_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["rack"]
)
async def delete_slot(obj_id: uuid.UUID, session: Session, _u: User) -> None:
    await slots_repo.soft_delete(session, obj_id)


@router.post("/slots/{obj_id}/occupy", response_model=s.RackOut, tags=["rack"])
async def occupy_slot(
    obj_id: uuid.UUID, payload: s.RackOccupy, session: Session, _u: User
) -> Any:
    slot = await slots_repo.get(session, obj_id)
    if slot.occupied:
        raise ConflictError(
            f"slot {slot.code} is already occupied by {slot.occupied_by_model}"
        )
    if slot.slot_state == "blocked":
        raise ConflictError(f"slot {slot.code} is blocked and cannot be used")
    await _assert_model_known(payload.occupied_by_model)
    slot.occupied = True
    slot.slot_state = "occupied"
    slot.occupied_by_model = payload.occupied_by_model
    slot.date_of_occupied = payload.date_of_occupied or datetime.now(UTC)
    if payload.notes is not None:
        slot.notes = payload.notes
    await session.flush()
    return s.RackOut.model_validate(slot)


@router.post("/slots/{obj_id}/release", response_model=s.RackOut, tags=["rack"])
async def release_slot(obj_id: uuid.UUID, session: Session, _u: User) -> Any:
    slot = await slots_repo.get(session, obj_id)
    slot.occupied = False
    slot.slot_state = "empty"
    slot.occupied_by_model = None
    slot.date_of_occupied = None
    await session.flush()
    return s.RackOut.model_validate(slot)


@router.post("/slots/{obj_id}/state", response_model=s.RackOut, tags=["rack"])
async def set_slot_state(
    obj_id: uuid.UUID, payload: s.RackSlotState, session: Session, _u: User
) -> Any:
    """Reserve or block a free slot (or return it to empty)."""
    slot = await slots_repo.get(session, obj_id)
    if slot.occupied:
        raise ConflictError(
            f"slot {slot.code} is occupied — release it before changing its state"
        )
    slot.slot_state = payload.slot_state
    if payload.notes is not None:
        slot.notes = payload.notes
    await session.flush()
    return s.RackOut.model_validate(slot)


async def _assert_model_known(model_no: str) -> None:
    """Cross-service check via the Masterdata REST API (never its DB).

    Opt-in through ``RACK_VALIDATE_MODEL``; a network failure is treated as
    'unknown, allow' so Rack stays available if Masterdata is down.
    """
    ok = await model_exists(model_no)
    if ok is False:
        raise ConflictError(
            f"model_no '{model_no}' is not registered in the Masterdata service"
        )
