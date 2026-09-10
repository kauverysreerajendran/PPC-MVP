"""Domain exceptions + global handlers producing the consistent error schema."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.context import request_id_ctx
from app.core.logging import get_logger

log = get_logger("app.error")


class AppError(Exception):
    """Base class for expected, mapped errors."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "bad_request"

    def __init__(self, message: str | None = None, *, details: Any = None) -> None:
        self.message = message or self.__doc__ or self.code
        self.details = details
        super().__init__(self.message)


class NotFoundError(AppError):
    """Resource not found"""

    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class ConflictError(AppError):
    """Resource already exists or conflicts with current state"""

    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


class AuthenticationError(AppError):
    """Authentication failed"""

    status_code = status.HTTP_401_UNAUTHORIZED
    code = "invalid_credentials"


class TokenReuseError(AuthenticationError):
    """Refresh token reuse detected; token family revoked"""

    code = "token_reused"


class PermissionDeniedError(AppError):
    """You do not have permission to perform this action"""

    status_code = status.HTTP_403_FORBIDDEN
    code = "forbidden"


class RateLimitedError(AppError):
    """Too many requests"""

    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"

    def __init__(self, retry_after: int, message: str | None = None) -> None:
        super().__init__(message)
        self.retry_after = retry_after


def _body(code: str, message: str, statusc: int, details: Any = None) -> dict:
    payload: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id_ctx.get(),
            "status": statusc,
        }
    }
    if details is not None:
        payload["error"]["details"] = details
    return payload


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        headers = {}
        if isinstance(exc, RateLimitedError):
            headers["Retry-After"] = str(exc.retry_after)
        return JSONResponse(
            status_code=exc.status_code,
            content=_body(exc.code, exc.message, exc.status_code, exc.details),
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_body("validation_error", "Request validation failed", 422, details),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_body("http_error", str(exc.detail), exc.status_code),
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled_exception", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=_body("internal_error", "An internal error occurred", 500),
        )
