from __future__ import annotations

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.middleware.metrics import PrometheusMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_context import RequestContextMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware


def install_middleware(app: FastAPI) -> None:
    """Order matters: last added = outermost. We want:
    RequestContext -> Metrics -> SecurityHeaders -> CORS -> RateLimit -> app."""
    app.add_middleware(
        RateLimitMiddleware,
        exempt_paths=(
            "/healthz",
            "/readyz",
            "/startupz",
            f"{settings.API_V1_PREFIX}/metrics",
            # /admin is low-traffic, separately authenticated, and serves its own
            # static assets — the app rate limiter would only get in the way.
            "/admin",
        ),
    )
    if settings.BACKEND_CORS_ORIGINS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.BACKEND_CORS_ORIGINS,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-Request-ID"],
            max_age=600,
        )
    app.add_middleware(SecurityHeadersMiddleware)
    if settings.METRICS_ENABLED:
        app.add_middleware(PrometheusMiddleware)
    app.add_middleware(RequestContextMiddleware)
