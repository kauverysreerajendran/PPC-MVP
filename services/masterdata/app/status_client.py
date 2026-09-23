"""HTTP client for the Status service.

Masterdata never keeps its own copy of a line's outward / inward status: it
reports each change to the Status service — the single source of truth — and
every screen reads the value back from there (BLUEPRINT §12: no cross-service
database access).

Auth: the services share the HS256 ``SECRET_KEY``, so unless a static
``MASTERDATA_STATUS_TOKEN`` is configured this module mints a short-lived
service token.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from jose import jwt

from app.config import settings

log = logging.getLogger("masterdata.status")


class StatusServiceError(Exception):
    """The Status service could not record the change."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


def _headers() -> dict[str, str]:
    if settings.MASTERDATA_STATUS_TOKEN:
        return {"Authorization": f"Bearer {settings.MASTERDATA_STATUS_TOKEN}"}
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


def _base() -> str:
    return str(settings.MASTERDATA_STATUS_API_BASE_URL).rstrip("/")


def event(
    sap_reference_id: str,
    stage: str,
    code: str,
    *,
    actor: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    """One status change in the Status service's ``EventIn`` shape."""
    return {
        "sap_reference_id": sap_reference_id,
        "stage": stage,
        "code": code,
        "actor": actor,
        "note": note,
        "source": settings.SERVICE_NAME,
    }


async def report(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Apply status changes in one transaction on the Status service.

    Raises :class:`StatusServiceError` when it cannot be reached or refuses the
    change, so the caller's own write rolls back and the two never disagree.
    """
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                f"{_base()}/events/batch", json={"events": events}, headers=_headers()
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        log.warning("status report failed: %s", exc)
        raise StatusServiceError(
            "Status service is unavailable — nothing was saved. Try again."
        ) from exc


async def refs_in(stage: str, code: str) -> list[str]:
    """Every SAP reference currently in ``code`` at ``stage``.

    The mirror of :func:`report`: a worklist that splits on a status asks the
    Status service which references are in it and filters its own rows by them,
    instead of keeping a copy of the status here.
    """
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{_base()}/refs", params={"stage": stage, "code": code}, headers=_headers()
            )
            resp.raise_for_status()
            return list(resp.json().get("refs", []))
    except httpx.HTTPError as exc:
        log.warning("status refs lookup failed (%s/%s): %s", stage, code, exc)
        raise StatusServiceError(
            "Status service is unavailable — cannot filter by status."
        ) from exc


async def current(sap_reference_id: str) -> dict[str, dict[str, Any]]:
    """Current status per stage of one SAP line (stages never reported are absent)."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{_base()}/lines/by-ref/{sap_reference_id}", headers=_headers()
            )
            resp.raise_for_status()
            return resp.json().get("stages", {})
    except httpx.HTTPError as exc:
        log.warning("status read failed for %s: %s", sap_reference_id, exc)
        raise StatusServiceError(
            "Status service is unavailable — try again."
        ) from exc
