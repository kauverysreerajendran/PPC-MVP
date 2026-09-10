"""Structured JSON logging via structlog. One event per line to stdout."""

from __future__ import annotations

import logging
import sys

import structlog

from app.core.config import settings
from app.core.context import current_context

_SENSITIVE = {"password", "token", "secret", "authorization", "cookie", "refresh_token"}


def _inject_context(_: object, __: str, event: dict) -> dict:
    for k, v in current_context().items():
        event.setdefault(k, v)
    return event


def _redact(_: object, __: str, event: dict) -> dict:
    for key in list(event):
        if key.lower() in _SENSITIVE:
            event[key] = "***"
    return event


def configure_logging() -> None:
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)

    shared = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        _inject_context,
        _redact,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    renderer = (
        structlog.dev.ConsoleRenderer() if settings.DEBUG else structlog.processors.JSONRenderer()
    )
    structlog.configure(
        processors=[*shared, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = "app") -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
