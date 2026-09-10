"""Read-only HTTP client for the Masterdata service.

The Rack service never connects to the ``masterdata`` database (BLUEPRINT §12).
When it needs to know whether a model_no is real it asks the Masterdata REST API.
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings

log = logging.getLogger("rack.masterdata")


async def model_exists(model_no: str) -> bool | None:
    """Return True/False if the Masterdata service answered, else None.

    None means 'could not verify' (validation disabled or service unreachable);
    callers treat that as non-blocking.
    """
    if not settings.RACK_VALIDATE_MODEL:
        return None

    base = str(settings.RACK_MASTERDATA_API_BASE_URL).rstrip("/")
    headers = (
        {"Authorization": f"Bearer {settings.RACK_MASTERDATA_TOKEN}"}
        if settings.RACK_MASTERDATA_TOKEN
        else {}
    )
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{base}/models",
                params={"search": model_no, "page_size": 50},
                headers=headers,
            )
            resp.raise_for_status()
            items = resp.json().get("items", [])
            return any(str(i.get("model_no")) == model_no for i in items)
    except Exception as exc:  # noqa: BLE001
        log.warning("masterdata model check failed for %s: %s", model_no, exc)
        return None
