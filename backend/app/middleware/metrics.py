from __future__ import annotations

import time

from starlette.requests import Request
from starlette.types import ASGIApp

from app.core.metrics import (
    http_request_duration_seconds,
    http_requests_in_progress,
    http_requests_total,
)


class PrometheusMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):  # type: ignore[no-untyped-def]
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        route = _route_template(request)
        method = request.method
        http_requests_in_progress.labels(method, route).inc()
        start = time.perf_counter()
        status_code = 500

        async def send_wrapper(message):  # type: ignore[no-untyped-def]
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            http_requests_in_progress.labels(method, route).dec()
            http_request_duration_seconds.labels(method, route).observe(time.perf_counter() - start)
            http_requests_total.labels(method, route, str(status_code)).inc()


def _route_template(request: Request) -> str:
    route = request.scope.get("route")
    return getattr(route, "path", request.url.path)
