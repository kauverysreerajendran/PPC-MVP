"""Consistent error envelope for unexpected failures (docs/07).

The SAP service raises plain FastAPI ``HTTPException``s for expected cases;
this module only makes sure an *unexpected* exception never leaves the process
as a bare text ``500`` — the frontend relies on the JSON envelope to tell a
crashed request apart from a service that is not running at all.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

log = logging.getLogger("sap-integration.errors")


def _body(code: str, message: str, http_status: int) -> dict:
    return {"error": {"code": code, "message": message, "status": http_status}}


def init_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled error: %s", exc, exc_info=exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_body(
                "internal_error",
                "internal server error",
                status.HTTP_500_INTERNAL_SERVER_ERROR,
            ),
        )
