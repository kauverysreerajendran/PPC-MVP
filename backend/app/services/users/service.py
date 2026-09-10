from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.infra import cache
from app.models.user import User
from app.repositories.user import UserRepository
from app.schemas.common import Page, PageParams
from app.services.audit import record_audit


def _user_key(user_id: int) -> str:
    return cache.key("user", str(user_id))


class UserService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UserRepository(session)

    async def get(self, user_id: int) -> User:
        user = await self.users.get(user_id)
        if user is None:
            raise NotFoundError("User not found")
        return user

    async def list(self, params: PageParams) -> Page[User]:
        rows, total = await self.users.paginate(
            offset=params.offset, limit=params.size, sort=params.sort or "-created_at"
        )
        return Page.build(rows, total, params)

    async def update_profile(self, user_id: int, *, full_name: str | None) -> User:
        user = await self.get(user_id)
        if full_name is not None:
            user.full_name = full_name
        await self.session.flush()
        await cache.invalidate(_user_key(user_id))
        return user

    async def set_role(self, actor_id: int, user_id: int, role: str) -> User:
        user = await self.get(user_id)
        before = user.role
        user.role = role
        await self.session.flush()
        await record_audit(
            self.session,
            actor_id=actor_id,
            action="user.role_change",
            entity="user",
            entity_id=str(user_id),
            diff={"role": {"from": before, "to": role}},
        )
        await cache.invalidate(_user_key(user_id))
        return user
