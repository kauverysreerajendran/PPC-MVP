"""Read-only HTTP client for the Masterdata service.

The Rack service never connects to the ``masterdata`` database (BLUEPRINT §12).
When it needs master data — is a model_no real, what SAP outward lines are
waiting to be stored — it asks the Masterdata REST API.

Auth: the services share the HS256 ``SECRET_KEY``, so when no static
``RACK_MASTERDATA_TOKEN`` is configured this module mints its own short-lived
service token.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from jose import jwt

from app.config import settings

log = logging.getLogger("rack.masterdata")


def _auth_headers() -> dict[str, str]:
    if settings.RACK_MASTERDATA_TOKEN:
        return {"Authorization": f"Bearer {settings.RACK_MASTERDATA_TOKEN}"}
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


def _base() -> str:
    return str(settings.RACK_MASTERDATA_API_BASE_URL).rstrip("/")


async def model_exists(model_no: str) -> bool | None:
    """Return True/False if the Masterdata service answered, else None.

    None means 'could not verify' (validation disabled or service unreachable);
    callers treat that as non-blocking.
    """
    if not settings.RACK_VALIDATE_MODEL:
        return None
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{_base()}/models",
                params={"search": model_no, "page_size": 50},
                headers=_auth_headers(),
            )
            resp.raise_for_status()
            items = resp.json().get("items", [])
            return any(str(i.get("model_no")) == model_no for i in items)
    except Exception as exc:  # noqa: BLE001
        log.warning("masterdata model check failed for %s: %s", model_no, exc)
        return None


async def list_sap_outwards(
    *,
    outward_status: str | None = None,
    page_size: int = 200,
    max_pages: int = 25,
) -> list[dict[str, Any]]:
    """Every SAP outward line, as plain dicts (paginates the Masterdata API).

    Raises on a transport / auth failure so the caller can report it — unlike
    ``model_exists`` this is an explicit action, not a best-effort guard.
    """
    out: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=15) as client:
        for page in range(1, max_pages + 1):
            params: dict[str, Any] = {"page": page, "page_size": page_size}
            if outward_status:
                params["outward_status"] = outward_status
            resp = await client.get(
                f"{_base()}/sap-outwards", params=params, headers=_auth_headers()
            )
            resp.raise_for_status()
            body = resp.json()
            items = body.get("items", [])
            out.extend(items)
            if len(out) >= body.get("total", len(out)) or not items:
                break
    return out
