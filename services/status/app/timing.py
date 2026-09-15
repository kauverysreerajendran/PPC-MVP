"""Server-Timing response header (docs/10 §7 — request timing must be observable).

Pure ASGI, no dependencies. Adds ``Server-Timing: app;dur=<ms>`` to every HTTP
response so the browser Network tab (and ``frontend/src/lib/perf.ts``) can
separate the time spent inside this service from network / proxy time.
"""

from __future__ import annotations

import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send


class ServerTimingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                dur_ms = (time.perf_counter() - start) * 1000
                headers = list(message.get("headers", []))
                headers.append((b"server-timing", f"app;dur={dur_ms:.1f}".encode()))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)
