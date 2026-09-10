"""Request-scoped context propagated to logs, metrics, and Celery tasks."""

from __future__ import annotations

from contextvars import ContextVar

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")
correlation_id_ctx: ContextVar[str] = ContextVar("correlation_id", default="-")
user_id_ctx: ContextVar[str | None] = ContextVar("user_id", default=None)


def current_context() -> dict[str, str | None]:
    return {
        "request_id": request_id_ctx.get(),
        "correlation_id": correlation_id_ctx.get(),
        "user_id": user_id_ctx.get(),
    }
