from __future__ import annotations

import time

import structlog
import ulid
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.context import correlation_id_ctx, request_id_ctx
from app.core.logging import get_logger

log = get_logger("app.access")


class RequestContextMiddleware:
    """Assigns request/correlation IDs, emits one structured access log per request,
    echoes X-Request-ID back to the client and adds ``Server-Timing: app;dur=<ms>``
    (docs/10 §7) so the browser can separate server time from network time.
    Pure ASGI for low overhead."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        request_id = headers.get("x-request-id") or ulid.new().str
        correlation_id = headers.get("x-correlation-id") or request_id
        request_id_ctx.set(request_id)
        correlation_id_ctx.set(correlation_id)
        structlog.contextvars.bind_contextvars(request_id=request_id, correlation_id=correlation_id)

        start = time.perf_counter()
        status_holder: dict[str, int] = {"status": 500}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                message.setdefault("headers", [])
                message["headers"].append((b"x-request-id", request_id.encode()))
                dur_ms = (time.perf_counter() - start) * 1000
                message["headers"].append((b"server-timing", f"app;dur={dur_ms:.1f}".encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log.info(
                "http_request",
                method=scope["method"],
                path=scope["path"],
                status=status_holder["status"],
                duration_ms=duration_ms,
            )
            structlog.contextvars.clear_contextvars()
