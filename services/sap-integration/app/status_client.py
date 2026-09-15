"""Read-only HTTP client for the Status service.

SAP lines carry no status of their own here. To split the SAP Outward grid into
"open" and "completed" lines, this service asks the Status service which SAP
references are in a status and filters its own query by them (BLUEPRINT §12: no
cross-service database access).

Auth: unless a static ``SAP_STATUS_TOKEN`` is configured this module mints a
short-lived service token from the shared ``SECRET_KEY``.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import HTTPException, status
from jose import jwt

from app.config import settings

log = logging.getLogger("sap.status")


def _headers() -> dict[str, str]:
    if settings.SAP_STATUS_TOKEN:
        return {"Authorization": f"Bearer {settings.SAP_STATUS_TOKEN}"}
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": settings.SERVICE_NAME,
            "type": "access",
            "role": "service",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return {"Authorization": f"Bearer {token}"}


async def refs_in(stage: str, code: str) -> list[str]:
    """Every SAP reference currently in ``code`` at ``stage``."""
    base = str(settings.SAP_STATUS_API_BASE_URL).rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{base}/refs", params={"stage": stage, "code": code}, headers=_headers()
            )
            resp.raise_for_status()
            return list(resp.json().get("refs", []))
    except httpx.HTTPError as exc:
        log.warning("status refs lookup failed (%s/%s): %s", stage, code, exc)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Status service is unavailable — cannot filter by status.",
        ) from exc
