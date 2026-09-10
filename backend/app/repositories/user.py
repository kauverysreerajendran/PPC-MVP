from __future__ import annotations

from sqlalchemy import func, select

from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User
    sortable = {"created_at": "created_at", "email": "email"}

    async def get_by_email(self, email: str) -> User | None:
        stmt = self._base_query().where(func.lower(User.email) == email.lower())
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def email_exists(self, email: str) -> bool:
        stmt = select(func.count()).select_from(User).where(func.lower(User.email) == email.lower())
        return bool((await self.session.execute(stmt)).scalar_one())
