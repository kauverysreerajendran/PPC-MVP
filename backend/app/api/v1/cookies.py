from __future__ import annotations

from fastapi import Response

from app.core.config import settings

REFRESH_COOKIE = "refresh_token"
# Root path so the cookie is also sent on page navigations — the Next.js server
# components read it to guard routes (requireUser). HttpOnly + SameSite=strict
# keep it safe. Was scoped to `${API_V1_PREFIX}/auth`, which broke SSR auth.
REFRESH_PATH = "/"


def set_refresh_cookie(response: Response, token: str, max_age: int) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=settings.ENVIRONMENT.is_production_like,
        samesite="strict",
        path=REFRESH_PATH,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_PATH)
