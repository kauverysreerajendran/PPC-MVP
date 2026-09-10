from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class PageParams(BaseModel):
    page: int = Field(1, ge=1)
    size: int = Field(20, ge=1, le=100)
    sort: str | None = None

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size


class PageMeta(BaseModel):
    page: int
    size: int
    total: int
    pages: int


class Page(BaseModel, Generic[T]):
    data: list[T]
    pagination: PageMeta

    @classmethod
    def build(cls, items: list[T], total: int, params: PageParams) -> Page[T]:
        pages = (total + params.size - 1) // params.size if params.size else 0
        return cls(
            data=items,
            pagination=PageMeta(page=params.page, size=params.size, total=total, pages=pages),
        )
