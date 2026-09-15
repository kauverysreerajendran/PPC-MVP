"""HTTP client for the Status service.

The Rack service reports where a SAP line stands at the ``rack`` stage (partially
placed / placed) to the Status service — the single source of truth — instead of
keeping that status itself (BLUEPRINT §12: no cross-service database access).

Auth: unless a static ``RACK_STATUS_TOKEN`` is configured this module mints a
short-lived service token from the shared ``SECRET_KEY``.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from jose import jwt

from app.config import settings

log = logging.getLogger("rack.status")


class StatusServiceError(Exception):
    """The Status service could not record the change."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


def _headers() -> dict[str, str]:
    if settings.RACK_STATUS_TOKEN:
        return {"Authorization": f"Bearer {settings.RACK_STATUS_TOKEN}"}
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": settings.RACK_SERVICE_SUBJECT,
            "type": "access",
            "role": "service",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return {"Authorization": f"Bearer {token}"}


async def report(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Apply status changes in one transaction on the Status service.

    Raises :class:`StatusServiceError` so the caller's own write rolls back and
    the rack and its reported status never disagree.
    """
    base = str(settings.RACK_STATUS_API_BASE_URL).rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                f"{base}/events/batch", json={"events": events}, headers=_headers()
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        log.warning("status report failed: %s", exc)
        raise StatusServiceError(
            "Status service is unavailable — nothing was placed. Try again."
        ) from exc
