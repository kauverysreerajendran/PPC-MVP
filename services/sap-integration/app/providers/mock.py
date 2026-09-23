"""Deterministic sample SAP data for the MVP.

Rows are stable for a given day+index so repeated syncs upsert rather than
duplicate (``sap_reference_id`` is the natural key).
"""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from .base import SapRecordDTO

# The vendor master (masterdata service) is the only source of vendors; the feed
# may not invent its own, or the Vendor column renders "not in master".
_VENDORS = [
    ("KALAI-INDUSTRIES", "Kalai Industries"),
    ("SHINE-TIMES", "Shine Times"),
]
# Real model numbers read off the shop-floor RACK-K chart (KL + KR faces).
_MODELS = [
    "90086", "90102", "90110", "90127", "90140",
    "90142", "90148", "90169", "90174", "90198",
]
# This WIM flow only handles goods receipts.
_MOVEMENTS = ["101"]  # 101 = Goods Receipt


class MockSapProvider:
    name = "mock"

    async def fetch_inward_records(self, *, count: int | None = None) -> list[SapRecordDTO]:
        n = count or 20  # the MVP's batch size (see app/seed.py)
        today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        out: list[SapRecordDTO] = []
        for i in range(n):
            rnd = random.Random(f"{today.date()}-{i}")  # noqa: S311 - not security-sensitive
            vendor_code, vendor_name = rnd.choice(_VENDORS)
            model = rnd.choice(_MODELS)
            # Multiples of 20 only — a lot splits down the middle into front
            # and back cases, and both halves have to be round themselves
            # (120 -> 60 + 60), which is how the shop floor counts a lot.
            qty = Decimal(rnd.randrange(40, 500, 20))
            out.append(
                SapRecordDTO(
                    sap_reference_id=f"SAP-{today:%y%m%d}-{i + 1:03d}",
                    transaction_date=today + timedelta(hours=rnd.randrange(6, 18)),
                    dc_no=f"DC-{today:%y%m%d}-{rnd.randrange(1, 40):02d}",
                    po_no=f"PO-{rnd.randrange(4500000000, 4500009999)}",
                    material_no=f"MAT-{rnd.randrange(100000, 999999)}",
                    model_no=model,
                    material_description=f"{model} movement sub-assembly, semi-finished",
                    vendor_code=vendor_code,
                    vendor_name=vendor_name,
                    batch_no=f"B{today:%y%m}{rnd.randrange(1, 99):02d}",
                    lot_no=f"LOT-{rnd.randrange(1000, 9999)}",
                    quantity=qty,
                    movement_type=rnd.choice(_MOVEMENTS),
                )
            )
        return out
