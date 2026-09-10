from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Cookie, Request, Response, status

from app.api.dependencies.auth import CurrentUser
from app.api.dependencies.common import DbSession
from app.api.v1.cookies import clear_refresh_cookie, set_refresh_cookie
from app.core.config import settings
from app.core.exceptions import AuthenticationError
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserPublic
from app.services.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _client(request: Request) -> tuple[str | None, str | None]:
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None)
    return ip, request.headers.get("user-agent")


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, session: DbSession) -> UserPublic:
    user = await AuthService(session).register(payload.email, payload.password, payload.full_name)
    return UserPublic.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest, request: Request, response: Response, session: DbSession
) -> TokenResponse:
    ip, ua = _client(request)
    result = await AuthService(session).authenticate(
        payload.email, payload.password, ip=ip, user_agent=ua
    )
    set_refresh_cookie(response, result.refresh_token, result.refresh_expires_in)
    return result.access


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    session: DbSession,
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> TokenResponse:
    if not refresh_token:
        raise AuthenticationError("Missing refresh token")
    ip, ua = _client(request)
    result = await AuthService(session).refresh(refresh_token, ip=ip, user_agent=ua)
    set_refresh_cookie(response, result.refresh_token, result.refresh_expires_in)
    return result.access


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response, session: DbSession, refresh_token: Annotated[str | None, Cookie()] = None
) -> Response:
    if refresh_token:
        await AuthService(session).logout(refresh_token)
    clear_refresh_cookie(response)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserPublic)
async def me(user: CurrentUser) -> UserPublic:
    return UserPublic.model_validate(user)


# expose config-derived constant for docs/tests
ACCESS_TTL_SECONDS = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
