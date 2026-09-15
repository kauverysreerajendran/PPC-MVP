"""Generic async CRUD + list/search/sort/paginate over the masterdata tables.

Pure data access and the small amount of shared business logic (uniqueness
pre-checks, soft delete). HTTP concerns live in the routers.
"""

from __future__ import annotations

import uuid
from typing import Any, Generic, TypeVar

from pydantic import BaseModel
from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.errors import ConflictError, NotFoundError
from app.models import Base

M = TypeVar("M", bound=Base)


class CrudRepository(Generic[M]):
    def __init__(
        self,
        model: type[M],
        *,
        searchable: tuple[InstrumentedAttribute[Any], ...],
        sortable: dict[str, InstrumentedAttribute[Any]],
        unique_fields: tuple[str, ...] = (),
        default_sort: str = "created_at",
    ) -> None:
        self.model = model
        self.searchable = searchable
        self.sortable = sortable
        self.unique_fields = unique_fields
        self.default_sort = default_sort

    async def get(self, session: AsyncSession, obj_id: uuid.UUID) -> M:
        obj = await session.get(self.model, obj_id)
        if obj is None:
            raise NotFoundError(self.model.__name__)
        return obj

    async def list(
        self,
        session: AsyncSession,
        *,
        page: int,
        page_size: int,
        search: str | None,
        sort: str,
        direction: str,
        filters: dict[str, Any] | None = None,
        with_total: bool = True,
    ) -> tuple[list[M], int]:
        """``with_total=False`` skips the COUNT(*) (docs/02 §4.3 — return the total
        only when the client needs it); the returned total is then the number of
        rows on this page."""
        where: list[ColumnElement[bool]] = []
        for field, value in (filters or {}).items():
            if value is not None:
                where.append(getattr(self.model, field) == value)
        if search and self.searchable:
            like = f"%{search.strip()}%"
            conds: list[ColumnElement[bool]] = [c.ilike(like) for c in self.searchable]
            where.append(or_(*conds))
        stmt = select(self.model).where(*where)

        total = 0
        if with_total:
            # Count the table directly with the same predicates — no subquery
            # wrapper for the planner to flatten.
            total = (
                await session.scalar(select(func.count()).select_from(self.model).where(*where))
                or 0
            )

        col = self.sortable.get(sort) or self.sortable.get(self.default_sort)
        if col is None:  # pragma: no cover - default_sort is always registered
            col = next(iter(self.sortable.values()))
        stmt = stmt.order_by(col.desc() if direction == "desc" else col.asc())
        stmt = stmt.limit(page_size).offset((page - 1) * page_size)
        rows = list((await session.scalars(stmt)).all())
        return rows, (total if with_total else len(rows))

    async def _assert_unique(
        self,
        session: AsyncSession,
        data: dict[str, Any],
        *,
        exclude_id: uuid.UUID | None = None,
    ) -> None:
        for field in self.unique_fields:
            value = data.get(field)
            if value is None:
                continue
            col = getattr(self.model, field)
            stmt = select(self.model.id).where(func.lower(col) == func.lower(str(value)))
            if exclude_id is not None:
                stmt = stmt.where(self.model.id != exclude_id)
            if await session.scalar(stmt) is not None:
                raise ConflictError(f"{field} '{value}' already exists")

    async def create(self, session: AsyncSession, payload: BaseModel) -> M:
        data = payload.model_dump(exclude_unset=True)
        await self._assert_unique(session, data)
        obj = self.model(**data)
        session.add(obj)
        await session.flush()
        return obj

    async def update(
        self, session: AsyncSession, obj_id: uuid.UUID, payload: BaseModel
    ) -> M:
        obj = await self.get(session, obj_id)
        data = payload.model_dump(exclude_unset=True)
        await self._assert_unique(session, data, exclude_id=obj_id)
        for key, value in data.items():
            setattr(obj, key, value)
        await session.flush()
        return obj

    async def soft_delete(self, session: AsyncSession, obj_id: uuid.UUID) -> None:
        obj = await self.get(session, obj_id)
        obj.status = "inactive"  # type: ignore[attr-defined]
        await session.flush()
