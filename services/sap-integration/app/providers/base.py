"""Provider interface. A provider turns "the SAP system" into a list of DTOs;
everything downstream (validation, persistence, sync-run bookkeeping) is
provider-agnostic.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class SapRecordDTO:
    sap_reference_id: str
    transaction_date: datetime
    dc_no: str | None
    po_no: str | None
    material_no: str | None
    model_no: str | None
    material_description: str | None
    vendor_code: str | None
    vendor_name: str | None
    batch_no: str | None
    lot_no: str | None
    quantity: Decimal | None
    movement_type: str | None


@runtime_checkable
class SapProvider(Protocol):
    name: str

    async def fetch_inward_records(self, *, count: int | None = None) -> list[SapRecordDTO]:
        """Return the current batch of SAP inward document lines."""
        ...
