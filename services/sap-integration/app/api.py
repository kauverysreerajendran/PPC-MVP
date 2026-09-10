"""HTTP routes — mounted at ``/api/v1/sap``."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.schemas import (
    EnumsOut,
    Page,
    SapInwardRecordOut,
    SapInwardRecordUpdate,
    SyncRunOut,
    SyncTriggerIn,
)
from app.security import Principal, current_principal
from app.service import SapService

router = APIRouter(tags=["sap"])

Session = Annotated[AsyncSession, Depends(get_session)]
User = Annotated[Principal, Depends(current_principal)]


@router.get("/records", response_model=Page[SapInwardRecordOut])
async def list_records(
    session: Session,
    _user: User,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    search: str | None = Query(None),
    sort: str = Query("transaction_date"),
    direction: str = Query("desc", pattern="^(asc|desc)$"),
) -> Page[SapInwardRecordOut]:
    return await SapService(session).list_records(
        page=page,
        page_size=page_size,
        search=search,
        sort=sort,
        direction=direction,
    )


@router.patch("/records/{record_id}", response_model=SapInwardRecordOut)
async def update_record(
    record_id: uuid.UUID,
    payload: SapInwardRecordUpdate,
    session: Session,
    _user: User,
) -> SapInwardRecordOut:
    return await SapService(session).update_record(record_id, payload)


@router.get("/enums", response_model=EnumsOut)
async def get_enums(session: Session, _user: User) -> EnumsOut:
    return await SapService(session).enums()


@router.get("/sync-runs", response_model=list[SyncRunOut])
async def list_sync_runs(
    session: Session, _user: User, limit: int = Query(20, ge=1, le=100)
) -> list[SyncRunOut]:
    return await SapService(session).list_sync_runs(limit=limit)


@router.post("/sync", response_model=SyncRunOut, status_code=status.HTTP_201_CREATED)
async def trigger_sync(
    payload: SyncTriggerIn,
    session: Session,
    user: User,
) -> SyncRunOut:
    return await SapService(session).run_sync(count=payload.count, triggered_by=user.subject)
