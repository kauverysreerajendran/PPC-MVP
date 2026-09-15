"""Place SAP outward lots into physical rack trays.

Pulls the SAP outward feed from the Masterdata API (never its DB, BLUEPRINT
§12) and, for every line that has not been placed yet, occupies ``no_of_trays``
random empty tray slots with that line's ``model_no``:

  * the lot quantity is split across those trays (``rack.qty`` per tray);
  * front-case trays land in the front rows of a rack, back-case trays in the
    back rows — mirroring the physical FC / BC convention;
  * trays for one lot are spread across many racks / aisles, so searching the
    model finds it in several places;
  * ``rack.lot_no`` and ``rack.sap_reference_id`` trace each tray back to the
    SAP document and make the whole operation idempotent (a document already
    represented in the ``rack`` table is skipped).
"""

from __future__ import annotations

import logging
import math
import random
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app.masterdata_client import list_sap_outwards

log = logging.getLogger("rack.allocation")

#: outward lines in these states are not placed (the stock has left the building)
SKIP_STATUSES = {"DISPATCHED", "CANCELLED"}


def _as_int(v: Any) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _as_decimal(v: Any) -> Decimal | None:
    if v is None:
        return None
    try:
        return Decimal(str(v))
    except Exception:  # noqa: BLE001
        return None


def _split_qty(total: Decimal | None, n: int) -> list[Decimal | None]:
    """Divide a lot quantity across ``n`` trays so the parts sum back to it."""
    if total is None or n <= 0:
        return [None] * max(n, 0)
    parts: list[Decimal] = []
    prev = Decimal(0)
    for i in range(1, n + 1):
        cut = (total * i / n).quantize(Decimal("0.001"))
        parts.append(cut - prev)
        prev = cut
    return parts  # type: ignore[return-value]


class _Warehouse:
    """Every empty tray in scope, split front / back, shuffled once."""

    def __init__(self, rng: random.Random) -> None:
        self._rng = rng
        self._front: list[m.Rack] = []
        self._back: list[m.Rack] = []

    def add(self, slot: m.Rack, row_count: int) -> None:
        front_rows = max(1, math.ceil(row_count / 2))
        (self._front if slot.row_no <= front_rows else self._back).append(slot)

    def shuffle(self) -> None:
        self._rng.shuffle(self._front)
        self._rng.shuffle(self._back)

    def take(self, want_front: int, want_back: int, want_any: int) -> list[m.Rack]:
        picked: list[m.Rack] = []
        picked += [self._front.pop() for _ in range(min(want_front, len(self._front)))]
        picked += [self._back.pop() for _ in range(min(want_back, len(self._back)))]
        shortfall = want_front + want_back + want_any - len(picked)
        for _ in range(max(0, shortfall)):
            if self._front and (not self._back or self._rng.random() < 0.5):
                picked.append(self._front.pop())
            elif self._back:
                picked.append(self._back.pop())
            else:
                break
        return picked

    def __len__(self) -> int:
        return len(self._front) + len(self._back)


async def _load_warehouse(
    session: AsyncSession,
    rng: random.Random,
    *,
    warehouse_code: str | None,
    aisle_code: str | None,
) -> _Warehouse:
    row_counts = {
        (mm.warehouse_code, mm.aisle_code, mm.rack_code): mm.row_count
        for mm in (
            await session.scalars(
                select(m.RackMaster).where(m.RackMaster.status == "active")
            )
        ).all()
    }
    stmt = select(m.Rack).where(m.Rack.status == "active", m.Rack.slot_state == "empty")
    if warehouse_code:
        stmt = stmt.where(m.Rack.warehouse_code == warehouse_code)
    if aisle_code:
        stmt = stmt.where(m.Rack.aisle_code == aisle_code)

    wh = _Warehouse(rng)
    for slot in (await session.scalars(stmt)).all():
        key = (slot.warehouse_code, slot.aisle_code, slot.rack_code)
        wh.add(slot, row_counts.get(key, 1))
    wh.shuffle()
    return wh


#: trays holding received pieces (``POST /place``) are never the allocator's
_NOT_RECEIVING = m.Rack.placement_source.is_distinct_from("receiving")


async def _placed_refs(session: AsyncSession) -> set[str]:
    rows = await session.scalars(
        select(m.Rack.sap_reference_id)
        .where(m.Rack.sap_reference_id.is_not(None), _NOT_RECEIVING)
        .distinct()
    )
    return {r for r in rows.all() if r}


async def reset_allocations(session: AsyncSession) -> int:
    """Free every tray a previous allocation filled (leaves hand-seeded stock and
    received pieces placed from SAP Inward)."""
    slots = (
        await session.scalars(
            select(m.Rack).where(m.Rack.sap_reference_id.is_not(None), _NOT_RECEIVING)
        )
    ).all()
    for slot in slots:
        slot.occupied = False
        slot.slot_state = "empty"
        slot.occupied_by_model = None
        slot.date_of_occupied = None
        slot.qty = None
        slot.lot_no = None
        slot.sap_reference_id = None
        slot.notes = None
    await session.flush()
    return len(slots)


async def allocate(
    session: AsyncSession,
    *,
    warehouse_code: str | None = None,
    aisle_code: str | None = None,
    reset: bool = False,
    dry_run: bool = False,
    seed: int | None = None,
) -> s.AllocateOut:
    rng = random.Random(seed)
    now = datetime.now(UTC)

    reset_count = 0
    if reset and not dry_run:
        reset_count = await reset_allocations(session)

    lines = await list_sap_outwards()
    already: set[str] = set() if reset else await _placed_refs(session)
    wh = await _load_warehouse(
        session, rng, warehouse_code=warehouse_code, aisle_code=aisle_code
    )

    results: list[s.AllocationLine] = []
    placed_total = skipped = 0

    for line in lines:
        model_no = (line.get("model_no") or "").strip()
        ref = (line.get("sap_reference_id") or "").strip()
        status = (line.get("outward_status") or "").strip().upper()
        if not model_no or status in SKIP_STATUSES:
            continue
        if ref and ref in already:
            skipped += 1
            results.append(
                s.AllocationLine(
                    sap_reference_id=ref,
                    lot_no=line.get("lot_no"),
                    model_no=model_no,
                    trays_requested=_as_int(line.get("no_of_trays")),
                    trays_placed=0,
                    status="already-placed",
                    locations=[],
                )
            )
            continue

        fc = _as_int(line.get("front_case_trays"))
        bc = _as_int(line.get("back_case_trays"))
        need = _as_int(line.get("no_of_trays")) or (fc + bc) or 1
        want_any = max(0, need - fc - bc)
        picked = wh.take(want_front=fc, want_back=bc, want_any=want_any)[:need]

        qty_parts = _split_qty(_as_decimal(line.get("quantity")), need)
        lot_no = line.get("lot_no")
        batch_no = line.get("batch_no")
        for i, slot in enumerate(picked):
            slot.occupied = True
            slot.slot_state = "occupied"
            slot.occupied_by_model = model_no
            slot.date_of_occupied = now
            slot.qty = qty_parts[i] if i < len(qty_parts) else None
            slot.lot_no = lot_no
            slot.sap_reference_id = ref or None
            slot.notes = (
                f"SAP {ref or '?'} · lot {lot_no or '?'} · batch {batch_no or '?'} "
                f"· tray {i + 1}/{need}"
            )

        placed_total += len(picked)
        if ref:
            already.add(ref)
        results.append(
            s.AllocationLine(
                sap_reference_id=ref or None,
                lot_no=lot_no,
                model_no=model_no,
                trays_requested=need,
                trays_placed=len(picked),
                status="placed" if len(picked) == need else "partial",
                locations=sorted(p.code for p in picked),
            )
        )

    if dry_run:
        await session.rollback()
    else:
        await session.flush()

    empty_left = await session.scalar(
        select(func.count())
        .select_from(m.Rack)
        .where(m.Rack.status == "active", m.Rack.slot_state == "empty")
    )

    return s.AllocateOut(
        generated_at=now,
        dry_run=dry_run,
        reset=reset,
        trays_freed=reset_count,
        lines_seen=len(lines),
        lines_placed=sum(1 for r in results if r.status == "placed"),
        lines_partial=sum(1 for r in results if r.status == "partial"),
        lines_skipped=skipped,
        trays_placed=placed_total,
        empty_trays_left=int(empty_left or 0),
        lines=results,
    )
