from __future__ import annotations

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_HEADERS = {
    b"x-content-type-options": b"nosniff",
    b"x-frame-options": b"DENY",
    b"referrer-policy": b"strict-origin-when-cross-origin",
    b"permissions-policy": b"geolocation=(), microphone=(), camera=()",
    b"cross-origin-opener-policy": b"same-origin",
}


class SecurityHeadersMiddleware:
    """Defence in depth: FastAPI asserts the headers even if it is exposed directly
    (Nginx sets them at the edge in production)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                present = {k.lower() for k, _ in headers}
                for k, v in _HEADERS.items():
                    if k not in present:
                        headers.append((k, v))
            await send(message)

        await self.app(scope, receive, send_wrapper)
