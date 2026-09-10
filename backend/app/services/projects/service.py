from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.core.rbac import Permission, role_has
from app.infra import cache
from app.models.project import Project
from app.repositories.project import ProjectRepository
from app.schemas.common import Page, PageParams
from app.schemas.project import ProjectCreate, ProjectPublic, ProjectUpdate


def _list_prefix(owner_id: int) -> str:
    return cache.key("projects", f"owner:{owner_id}:")


class ProjectService:
    """Owns project business rules: ownership checks, caching, invalidation."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ProjectRepository(session)

    async def _authorized_project(self, project_id: int, user_id: int, role: str) -> Project:
        project = await self.repo.get(project_id)
        if project is None:
            raise NotFoundError("Project not found")
        if project.owner_id != user_id and not role_has(role, Permission.PROJECT_DELETE):
            raise PermissionDeniedError()
        return project

    async def list_for_owner(self, owner_id: int, params: PageParams) -> Page[ProjectPublic]:
        cache_key = _list_prefix(owner_id) + f"{params.page}:{params.size}:{params.sort or ''}"

        async def loader() -> dict:
            rows, total = await self.repo.paginate(
                offset=params.offset,
                limit=params.size,
                sort=params.sort or "-created_at",
                filters=[Project.owner_id == owner_id],
            )
            page = Page.build([ProjectPublic.model_validate(r) for r in rows], total, params)
            return page.model_dump(mode="json")

        payload = await cache.get_or_set(cache_key, loader, ttl=60)
        return Page[ProjectPublic].model_validate(payload)

    async def create(self, owner_id: int, data: ProjectCreate) -> Project:
        project = Project(owner_id=owner_id, name=data.name, description=data.description)
        await self.repo.add(project)
        await cache.invalidate_prefix(_list_prefix(owner_id))
        return project

    async def get(self, project_id: int, user_id: int, role: str) -> Project:
        return await self._authorized_project(project_id, user_id, role)

    async def update(
        self, project_id: int, user_id: int, role: str, data: ProjectUpdate
    ) -> Project:
        project = await self._authorized_project(project_id, user_id, role)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(project, field, value.value if hasattr(value, "value") else value)
        await self.session.flush()
        await cache.invalidate_prefix(_list_prefix(project.owner_id))
        return project

    async def delete(self, project_id: int, user_id: int, role: str) -> None:
        project = await self._authorized_project(project_id, user_id, role)
        await self.repo.soft_delete(project)
        await cache.invalidate_prefix(_list_prefix(project.owner_id))
