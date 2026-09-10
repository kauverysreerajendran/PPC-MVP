"""HTTP routes — mounted at ``/api/v1/rack``.

    GET    /slots                 list (pagination + search + sort + filters)
    POST   /slots                 create a physical slot
    GET    /slots/{id}            retrieve
    PUT    /slots/{id}            update
    DELETE /slots/{id}            soft delete (status -> inactive)
    POST   /slots/{id}/occupy     dynamically place a model in the slot
    POST   /slots/{id}/release    free the slot
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app.crud import CrudRepository
from app.db import get_session
from app.errors import ConflictError
from app.masterdata_client import model_exists
from app.security import Principal, current_principal

Session = Annotated[AsyncSession, Depends(get_session)]
User = Annotated[Principal, Depends(current_principal)]

router = APIRouter()

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
        "row_no": m.Rack.row_no,
        "column_no": m.Rack.column_no,
        "shelf_no": m.Rack.shelf_no,
        "occupied": m.Rack.occupied,
        "occupied_by_model": m.Rack.occupied_by_model,
        "date_of_occupied": m.Rack.date_of_occupied,
        "status": m.Rack.status,
        "created_at": m.Rack.created_at,
        "updated_at": m.Rack.updated_at,
    },
    unique_fields=(),  # composite uniqueness enforced by the DB constraint
    default_sort="rack_code",
)


class ListParams:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        page_size: int = Query(25, ge=1, le=200),
        search: str | None = Query(None, description="case-insensitive contains match"),
        sort: str = Query("rack_code"),
        direction: str = Query("asc", pattern="^(asc|desc)$"),
        status: s.Status | None = Query(None, description="filter by row status"),
        rack_code: str | None = Query(None),
        occupied: bool | None = Query(None),
        occupied_by_model: str | None = Query(None),
    ) -> None:
        self.page = page
        self.page_size = page_size
        self.search = search
        self.sort = sort
        self.direction = direction
        self.status = status
        self.rack_code = rack_code
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
            "rack_code": p.rack_code,
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
    return s.RackOut.model_validate(await slots_repo.update(session, obj_id, payload))


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
            f"slot {slot.rack_code} r{slot.row_no}/c{slot.column_no}/s{slot.shelf_no} "
            f"is already occupied by {slot.occupied_by_model}"
        )
    await _assert_model_known(payload.occupied_by_model)
    slot.occupied = True
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
    slot.occupied_by_model = None
    slot.date_of_occupied = None
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
