"""Generic async repository. Owns persistence concerns only."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    model: type[ModelT]
    #: fields a client may sort by, mapped to columns
    sortable: dict[str, str] = {}

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _base_query(self, *, include_deleted: bool = False) -> Select[tuple[ModelT]]:
        stmt = select(self.model)
        if hasattr(self.model, "deleted_at") and not include_deleted:
            stmt = stmt.where(self.model.deleted_at.is_(None))  # type: ignore[attr-defined]
        return stmt

    def _apply_sort(self, stmt: Select, sort: str | None) -> Select:
        if not sort:
            return stmt
        for token in sort.split(","):
            token = token.strip()
            desc = token.startswith("-")
            key = token.lstrip("-+")
            col_name = self.sortable.get(key)
            if not col_name:
                continue
            col = getattr(self.model, col_name)
            stmt = stmt.order_by(col.desc() if desc else col.asc())
        return stmt

    async def get(self, id_: Any, *, include_deleted: bool = False) -> ModelT | None:
        stmt = self._base_query(include_deleted=include_deleted).where(self.model.id == id_)  # type: ignore[attr-defined]
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def paginate(
        self,
        *,
        offset: int,
        limit: int,
        sort: str | None = None,
        filters: list[Any] | None = None,
    ) -> tuple[list[ModelT], int]:
        stmt = self._base_query()
        for f in filters or []:
            stmt = stmt.where(f)
        total = (
            await self.session.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar_one()
        stmt = self._apply_sort(stmt, sort).offset(offset).limit(limit)
        rows = list((await self.session.execute(stmt)).scalars().all())
        return rows, int(total)

    async def add(self, obj: ModelT) -> ModelT:
        self.session.add(obj)
        await self.session.flush()
        return obj

    async def soft_delete(self, obj: ModelT) -> None:
        from datetime import UTC, datetime

        obj.deleted_at = datetime.now(UTC)  # type: ignore[attr-defined]
        await self.session.flush()
