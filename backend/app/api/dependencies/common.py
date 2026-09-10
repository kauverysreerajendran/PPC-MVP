from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db, get_db_ro
from app.schemas.common import PageParams

DbSession = Annotated[AsyncSession, Depends(get_db)]
DbSessionRO = Annotated[AsyncSession, Depends(get_db_ro)]


def pagination(
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
    sort: Annotated[str | None, Query(description="e.g. -created_at,name")] = None,
) -> PageParams:
    return PageParams(page=page, size=size, sort=sort)


Pagination = Annotated[PageParams, Depends(pagination)]
