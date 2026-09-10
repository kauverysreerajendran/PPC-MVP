from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.core.rbac import Role
from app.schemas.common import ORMModel


class UserPublic(ORMModel):
    id: int
    # Output model — plain str so local dev accounts (e.g. "dev") serialize.
    email: str
    full_name: str | None
    role: Role
    is_active: bool
    is_verified: bool
    created_at: datetime


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=200)


class UserRoleUpdate(BaseModel):
    role: Role
