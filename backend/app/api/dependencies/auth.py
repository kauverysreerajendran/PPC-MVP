from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import user_id_ctx
from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.rbac import Permission, Role, role_has
from app.core.security import decode_access_token
from app.db.session import get_db_ro
from app.models.user import User
from app.repositories.user import UserRepository

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: Annotated[AsyncSession, Depends(get_db_ro)],
) -> User:
    if creds is None:
        raise AuthenticationError("Missing bearer token")
    try:
        claims = decode_access_token(creds.credentials)
    except ValueError as exc:
        raise AuthenticationError("Invalid or expired token") from exc

    user = await UserRepository(session).get(int(claims["sub"]))
    if user is None or not user.is_active:
        raise AuthenticationError("Account not found or disabled")
    user_id_ctx.set(str(user.id))
    request.state.user = user
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*roles: Role):
    allowed = {r.value for r in roles}

    async def _dep(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise PermissionDeniedError("Insufficient role")
        return user

    return _dep


def require_permission(permission: Permission):
    async def _dep(user: CurrentUser) -> User:
        if not role_has(user.role, permission):
            raise PermissionDeniedError(f"Missing permission: {permission.value}")
        return user

    return _dep
