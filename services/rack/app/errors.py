"""Consistent error envelope + handlers. Raw DB exceptions never reach clients."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.status_client import StatusServiceError

log = logging.getLogger("rack.errors")


class ConflictError(Exception):
    """Raised when a uniqueness / business rule would be violated."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class NotFoundError(Exception):
    def __init__(self, resource: str) -> None:
        self.message = f"{resource} not found"
        super().__init__(self.message)


def _body(code: str, message: str, http_status: int) -> dict:
    return {"error": {"code": code, "message": message, "status": http_status}}


def init_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(NotFoundError)
    async def _not_found(_: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=_body("not_found", exc.message, status.HTTP_404_NOT_FOUND),
        )

    @app.exception_handler(ConflictError)
    async def _conflict(_: Request, exc: ConflictError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=_body("conflict", exc.message, status.HTTP_409_CONFLICT),
        )

    @app.exception_handler(StatusServiceError)
    async def _status_unavailable(_: Request, exc: StatusServiceError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=_body(
                "status_service_unavailable", exc.message, status.HTTP_503_SERVICE_UNAVAILABLE
            ),
        )

    @app.exception_handler(IntegrityError)
    async def _integrity(_: Request, exc: IntegrityError) -> JSONResponse:
        log.warning("integrity error: %s", exc)
        detail = "resource violates a uniqueness or referential constraint"
        orig = str(getattr(exc, "orig", "")).lower()
        if "foreign key" in orig:
            detail = "referenced record does not exist"
        elif "unique" in orig or "duplicate key" in orig:
            detail = "a record with the same unique value already exists"
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=_body("conflict", detail, status.HTTP_409_CONFLICT),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "request payload failed validation",
                    "status": status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "details": jsonable_encoder(exc.errors()),
                }
            },
        )
