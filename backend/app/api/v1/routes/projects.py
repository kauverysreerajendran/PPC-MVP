from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.api.dependencies.auth import CurrentUser
from app.api.dependencies.common import DbSession, DbSessionRO, Pagination
from app.api.dependencies.idempotency import Idempotency
from app.schemas.common import Page
from app.schemas.project import ProjectCreate, ProjectPublic, ProjectUpdate
from app.services.projects.service import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=Page[ProjectPublic])
async def list_projects(
    user: CurrentUser, session: DbSessionRO, params: Pagination
) -> Page[ProjectPublic]:
    return await ProjectService(session).list_for_owner(user.id, params)


@router.post("", response_model=ProjectPublic, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate, user: CurrentUser, session: DbSession, idem: Idempotency
) -> ProjectPublic:
    if (replay := await idem.replay()) is not None:
        return ProjectPublic.model_validate(replay["body"])
    project = await ProjectService(session).create(user.id, payload)
    body = ProjectPublic.model_validate(project)
    await idem.store(status.HTTP_201_CREATED, body.model_dump())
    return body


@router.get("/{project_id}", response_model=ProjectPublic)
async def get_project(project_id: int, user: CurrentUser, session: DbSessionRO) -> ProjectPublic:
    return ProjectPublic.model_validate(
        await ProjectService(session).get(project_id, user.id, user.role)
    )


@router.patch("/{project_id}", response_model=ProjectPublic)
async def update_project(
    project_id: int, payload: ProjectUpdate, user: CurrentUser, session: DbSession
) -> ProjectPublic:
    return ProjectPublic.model_validate(
        await ProjectService(session).update(project_id, user.id, user.role, payload)
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: int, user: CurrentUser, session: DbSession) -> Response:
    await ProjectService(session).delete(project_id, user.id, user.role)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
