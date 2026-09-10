from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies.auth import CurrentUser, require_permission
from app.api.dependencies.common import DbSession, DbSessionRO, Pagination
from app.core.rbac import Permission
from app.schemas.common import Page
from app.schemas.user import UserPublic, UserRoleUpdate, UserUpdate
from app.services.users.service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "",
    response_model=Page[UserPublic],
    dependencies=[Depends(require_permission(Permission.USER_READ))],
)
async def list_users(session: DbSessionRO, params: Pagination) -> Page[UserPublic]:
    page = await UserService(session).list(params)
    return Page[UserPublic].build(
        [UserPublic.model_validate(u) for u in page.data], page.pagination.total, params
    )


@router.get(
    "/{user_id}",
    response_model=UserPublic,
    dependencies=[Depends(require_permission(Permission.USER_READ))],
)
async def get_user(user_id: int, session: DbSessionRO) -> UserPublic:
    return UserPublic.model_validate(await UserService(session).get(user_id))


@router.patch("/me", response_model=UserPublic)
async def update_me(payload: UserUpdate, user: CurrentUser, session: DbSession) -> UserPublic:
    updated = await UserService(session).update_profile(user.id, full_name=payload.full_name)
    return UserPublic.model_validate(updated)


@router.put(
    "/{user_id}/role",
    response_model=UserPublic,
    dependencies=[Depends(require_permission(Permission.USER_WRITE))],
)
async def set_role(
    user_id: int, payload: UserRoleUpdate, actor: CurrentUser, session: DbSession
) -> UserPublic:
    updated = await UserService(session).set_role(actor.id, user_id, payload.role.value)
    return UserPublic.model_validate(updated)
