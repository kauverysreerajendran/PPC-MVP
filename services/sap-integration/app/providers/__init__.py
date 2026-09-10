from __future__ import annotations

from app.config import settings

from .base import SapProvider, SapRecordDTO
from .mock import MockSapProvider


def get_provider() -> SapProvider:
    """Provider factory. Only ``mock`` is wired until Titan confirms the SAP
    interface (OData / BAPI / RFC) — real providers slot in here with no change
    to the service or API."""
    if settings.SAP_PROVIDER == "mock":
        return MockSapProvider()
    raise RuntimeError(
        f"SAP_PROVIDER={settings.SAP_PROVIDER!r} not available "
        "(real SAP provider pending TITAN_SAP_*_TO_BE_CONFIRMED)"
    )


__all__ = ["SapProvider", "SapRecordDTO", "MockSapProvider", "get_provider"]
