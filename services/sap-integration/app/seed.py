"""Seed the MVP's 20 static SAP inward records — ``python -m app.seed``.

Until Titan confirms the real SAP interface the MVP ships with a fixed set of
inward document lines, so the application is database-driven from the first run
rather than reading anything hard-coded in the frontend.

They go in through exactly the same upsert path a SAP sync uses
(``SapRepository.upsert_records``), keyed on ``sap_reference_id``, which means:

  * re-running never creates a second copy of a row;
  * a later real SAP pull overwrites these rows like any other, with no special
    case anywhere in the service;
  * ``remark`` — the one application-owned column — is never touched by a
    re-seed, because ``upsert_records`` does not write it.

Reference ids are fixed (``SAP-MVP-001`` … ``SAP-MVP-020``) rather than derived
from the date, so the same twenty rows are refreshed instead of twenty new ones
being added. Every other field is a function of the row index alone; only
``transaction_date`` follows the calendar, anchored to the current day, so the
data stays recent and a re-run on the same day writes no change at all.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from app.config import settings
from app.db import SessionLocal, dispose_engine
from app.models import SapSyncRun
from app.providers.base import SapRecordDTO
from app.repository import SapRepository

log = logging.getLogger("sap.seed")

#: Recorded on the sync-run row so a seeded batch is distinguishable from a pull.
SEED_PROVIDER = "seed"

#: Vendors match the masterdata vendor master, so the seeded lines resolve to
#: real vendors once masterdata is seeded from this feed.
_VENDORS: dict[str, str] = {
    "KALAI-INDUSTRIES": "Kalai Industries",
    "SHINE-TIMES": "Shine Times",
}

#: (vendor_code, model_no, quantity, days_ago, hour). Quantities are multiples
#: of 20: a lot splits down the middle into front and back cases, and both
#: halves are themselves round (120 -> 60 + 60), which is how the shop floor
#: counts them. Model numbers are the real ones off the RACK-K chart. This WIM
#: flow only handles goods receipts, so every line is movement type 101.
_ROWS: list[tuple[str, str, int, int, int]] = [
    ("KALAI-INDUSTRIES", "90086", 120, 6, 9),
    ("SHINE-TIMES", "90102", 260, 6, 11),
    ("KALAI-INDUSTRIES", "90110", 80, 5, 10),
    ("SHINE-TIMES", "90127", 340, 5, 14),
    ("KALAI-INDUSTRIES", "90140", 180, 4, 9),
    ("SHINE-TIMES", "90142", 100, 4, 13),
    ("KALAI-INDUSTRIES", "90148", 420, 4, 16),
    ("SHINE-TIMES", "90169", 200, 3, 10),
    ("KALAI-INDUSTRIES", "90174", 160, 3, 12),
    ("SHINE-TIMES", "90198", 280, 3, 15),
    ("KALAI-INDUSTRIES", "90086", 60, 2, 9),
    ("SHINE-TIMES", "90102", 400, 2, 11),
    ("KALAI-INDUSTRIES", "90110", 220, 2, 14),
    ("SHINE-TIMES", "90127", 120, 1, 9),
    ("KALAI-INDUSTRIES", "90140", 300, 1, 12),
    ("SHINE-TIMES", "90142", 160, 1, 15),
    ("KALAI-INDUSTRIES", "90148", 80, 0, 9),
    ("SHINE-TIMES", "90169", 240, 0, 10),
    ("KALAI-INDUSTRIES", "90174", 120, 0, 13),
    ("SHINE-TIMES", "90198", 360, 0, 16),
]

SEED_COUNT = len(_ROWS)
MOVEMENT_TYPE = "101"  # 101 = Goods Receipt


def build_records(*, anchor: datetime | None = None) -> list[SapRecordDTO]:
    """The twenty seed lines. `anchor` fixes "today" for tests."""
    day = (anchor or datetime.now(UTC)).replace(hour=0, minute=0, second=0, microsecond=0)
    out: list[SapRecordDTO] = []
    for i, (vendor_code, model_no, qty, days_ago, hour) in enumerate(_ROWS, start=1):
        out.append(
            SapRecordDTO(
                sap_reference_id=f"SAP-MVP-{i:03d}",
                transaction_date=day - timedelta(days=days_ago) + timedelta(hours=hour),
                dc_no=f"DC-{2400 + i:04d}",
                po_no=f"PO-45000{i:05d}",
                material_no=f"MAT-{500000 + i * 137:06d}",
                model_no=model_no,
                material_description=f"{model_no} movement sub-assembly, semi-finished",
                vendor_code=vendor_code,
                vendor_name=_VENDORS[vendor_code],
                batch_no=f"BATCH-{9100 + i}",
                lot_no=f"LOT-{7000 + i * 13:04d}",
                quantity=Decimal(qty),
                movement_type=MOVEMENT_TYPE,
            )
        )
    return out


async def run() -> None:
    records = build_records()
    async with SessionLocal() as session:
        repo = SapRepository(session)
        run_row = await repo.add_sync_run(
            SapSyncRun(
                source_system=settings.SAP_SOURCE_SYSTEM,
                provider=SEED_PROVIDER,
                status="RUNNING",
                triggered_by="seed",
            )
        )
        ingested = await repo.upsert_records(
            records, source_system=settings.SAP_SOURCE_SYSTEM, sync_id=run_row.id
        )
        run_row.records_ingested = ingested
        run_row.status = "SUCCESS"
        run_row.finished_at = datetime.now(UTC)
        await session.commit()
    log.info("seeded %s SAP inward records (upsert on sap_reference_id — no duplicates)", ingested)


async def _main() -> None:
    try:
        await run()
    finally:
        await dispose_engine()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    asyncio.run(_main())


if __name__ == "__main__":
    main()
