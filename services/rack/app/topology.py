"""Derivation layer: rack_master (physical shape) + rack (live occupancy).

Everything the Rack Locator UI draws is computed here, never in the browser:

  * :func:`materialize`     — derive the tray slots of a rack from its master row
  * :func:`build_topology`  — warehouse -> aisle -> rack roll-up with occupancy
  * :func:`rack_detail`     — one rack expanded to shelf -> row -> tray
  * :func:`locate`          — ranked empty locations ("Locate Me")
  * :func:`resolve_code`    — turn ``K-S4-R2-T05`` into the exact slot

The counts are read from the database on every call, so a slot occupied or
freed by any other client shows up on the next refresh with no cache to bust.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, datetime
from typing import Iterable

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models as m
from app import schemas as s
from app.errors import NotFoundError

# --- physical constants used to score a walk to a slot ----------------------
# Distances are approximate shop-floor metres; they exist to rank candidates
# consistently, not to survey the building.
RACK_PITCH_M = 1.2  # centre-to-centre spacing of racks along an aisle
TRAY_PITCH_M = 0.35  # horizontal spacing of trays on a shelf
ROW_DEPTH_M = 0.40  # how much further back each vertical row sits
SHELF_STEP_M = 0.50  # ergonomic penalty per shelf away from waist height


# --- occupancy helpers ------------------------------------------------------
def _occupancy(
    capacity: int, occupied: int = 0, reserved: int = 0, blocked: int = 0
) -> s.Occupancy:
    """Empty is whatever the master says exists minus what is spoken for.

    Deriving `empty` (rather than counting rows in state 'empty') means a rack
    whose master was just widened reports the new trays as available straight
    away, before the slots are materialised.
    """
    empty = max(0, capacity - occupied - reserved - blocked)
    pct = (lambda n: round(n * 100 / capacity, 1) if capacity else 0.0)
    return s.Occupancy(
        capacity=capacity,
        occupied=occupied,
        empty=empty,
        reserved=reserved,
        blocked=blocked,
        occupancy_pct=pct(occupied),
        availability_pct=pct(empty),
    )


def _sum(items: Iterable[s.Occupancy]) -> s.Occupancy:
    cap = occ = res = blk = 0
    for o in items:
        cap += o.capacity
        occ += o.occupied
        res += o.reserved
        blk += o.blocked
    return _occupancy(cap, occ, res, blk)


def _rack_state(o: s.Occupancy) -> s.RackState:
    if o.capacity == 0 or o.empty == 0:
        return "full" if o.capacity else "empty"
    if o.occupied == 0 and o.reserved == 0:
        return "empty"
    if o.occupancy_pct >= 85:
        return "nearly_full"
    if o.occupancy_pct >= 50:
        return "filling"
    return "available"


# --- masters ----------------------------------------------------------------
async def active_masters(
    session: AsyncSession,
    *,
    warehouse_code: str | None = None,
    aisle_code: str | None = None,
    rack_code: str | None = None,
) -> list[m.RackMaster]:
    stmt = select(m.RackMaster).where(m.RackMaster.status == "active")
    if warehouse_code:
        stmt = stmt.where(m.RackMaster.warehouse_code == warehouse_code)
    if aisle_code:
        stmt = stmt.where(m.RackMaster.aisle_code == aisle_code)
    if rack_code:
        stmt = stmt.where(m.RackMaster.rack_code == rack_code)
    stmt = stmt.order_by(
        m.RackMaster.warehouse_code,
        m.RackMaster.aisle_code,
        m.RackMaster.position,
        m.RackMaster.rack_code,
    )
    return list((await session.scalars(stmt)).all())


async def materialize(session: AsyncSession, master: m.RackMaster) -> s.MaterializeOut:
    """Make the slot table match the master's shelf x row x tray grid.

    Idempotent. Slots inside the grid are created if missing and reactivated if
    they had been retired; slots outside the grid (after the master shrank) are
    soft-deleted unless something still sits in them.
    """
    rows = await session.scalars(
        select(m.Rack).where(
            m.Rack.warehouse_code == master.warehouse_code,
            m.Rack.aisle_code == master.aisle_code,
            m.Rack.rack_code == master.rack_code,
        )
    )
    existing = {(r.shelf_no, r.row_no, r.tray_no): r for r in rows.all()}

    created = reactivated = deactivated = 0
    grid: set[tuple[int, int, int]] = set()
    for shelf_no in range(1, master.shelf_count + 1):
        for row_no in range(1, master.row_count + 1):
            for tray_no in range(1, master.tray_count + 1):
                key = (shelf_no, row_no, tray_no)
                grid.add(key)
                slot = existing.get(key)
                if slot is None:
                    session.add(
                        m.Rack(
                            warehouse_code=master.warehouse_code,
                            aisle_code=master.aisle_code,
                            rack_code=master.rack_code,
                            shelf_no=shelf_no,
                            row_no=row_no,
                            tray_no=tray_no,
                            location_name=m.location_code(
                                master.rack_code, shelf_no, row_no, tray_no
                            ),
                            slot_state="empty",
                            occupied=False,
                            status="active",
                        )
                    )
                    created += 1
                elif slot.status != "active":
                    slot.status = "active"
                    reactivated += 1

    for key, slot in existing.items():
        if key not in grid and slot.status == "active" and not slot.occupied:
            slot.status = "inactive"
            deactivated += 1

    await session.flush()
    return s.MaterializeOut(
        rack_code=master.rack_code,
        warehouse_code=master.warehouse_code,
        aisle_code=master.aisle_code,
        capacity=master.capacity,
        created=created,
        deactivated=deactivated,
        reactivated=reactivated,
    )


# --- topology ---------------------------------------------------------------
async def _shelf_counts(
    session: AsyncSession,
    *,
    warehouse_code: str | None = None,
    aisle_code: str | None = None,
    rack_code: str | None = None,
) -> dict[tuple[str, str, str, int], dict[str, int]]:
    """{(warehouse, aisle, rack, shelf): {slot_state: count}} for active slots."""
    stmt = (
        select(
            m.Rack.warehouse_code,
            m.Rack.aisle_code,
            m.Rack.rack_code,
            m.Rack.shelf_no,
            m.Rack.slot_state,
            func.count().label("n"),
        )
        .where(m.Rack.status == "active")
        .group_by(
            m.Rack.warehouse_code,
            m.Rack.aisle_code,
            m.Rack.rack_code,
            m.Rack.shelf_no,
            m.Rack.slot_state,
        )
    )
    if warehouse_code:
        stmt = stmt.where(m.Rack.warehouse_code == warehouse_code)
    if aisle_code:
        stmt = stmt.where(m.Rack.aisle_code == aisle_code)
    if rack_code:
        stmt = stmt.where(m.Rack.rack_code == rack_code)

    out: dict[tuple[str, str, str, int], dict[str, int]] = defaultdict(dict)
    for w, a, r, shelf, state, n in (await session.execute(stmt)).all():
        out[(w, a, r, shelf)][state] = n
    return out


def _rack_summary(
    master: m.RackMaster,
    counts: dict[tuple[str, str, str, int], dict[str, int]],
) -> s.RackSummary:
    shelf_capacity = master.row_count * master.tray_count
    shelves: list[s.ShelfSummary] = []
    # top shelf first — the way a picker reads a rack
    for shelf_no in range(master.shelf_count, 0, -1):
        c = counts.get(
            (master.warehouse_code, master.aisle_code, master.rack_code, shelf_no), {}
        )
        shelves.append(
            s.ShelfSummary(
                shelf_no=shelf_no,
                label=f"S{shelf_no}",
                occupancy=_occupancy(
                    shelf_capacity,
                    c.get("occupied", 0),
                    c.get("reserved", 0),
                    c.get("blocked", 0),
                ),
            )
        )
    occ = _sum(sh.occupancy for sh in shelves)
    return s.RackSummary(
        id=master.id,
        warehouse_code=master.warehouse_code,
        aisle_code=master.aisle_code,
        rack_code=master.rack_code,
        rack_name=master.rack_name,
        position=master.position,
        side=master.side,
        shelf_count=master.shelf_count,
        row_count=master.row_count,
        tray_count=master.tray_count,
        occupancy=occ,
        state=_rack_state(occ),
        shelves=shelves,
    )


async def build_topology(
    session: AsyncSession,
    *,
    warehouse_code: str | None = None,
    aisle_code: str | None = None,
) -> s.TopologyOut:
    masters = await active_masters(
        session, warehouse_code=warehouse_code, aisle_code=aisle_code
    )
    counts = await _shelf_counts(
        session, warehouse_code=warehouse_code, aisle_code=aisle_code
    )

    by_warehouse: dict[str, dict[str, list[s.RackSummary]]] = defaultdict(
        lambda: defaultdict(list)
    )
    names: dict[str, str | None] = {}
    aisle_names: dict[tuple[str, str], str | None] = {}
    for master in masters:
        by_warehouse[master.warehouse_code][master.aisle_code].append(
            _rack_summary(master, counts)
        )
        names.setdefault(master.warehouse_code, master.warehouse_name)
        aisle_names.setdefault(
            (master.warehouse_code, master.aisle_code), master.aisle_name
        )

    warehouses: list[s.WarehouseSummary] = []
    for w_code, aisles in by_warehouse.items():
        aisle_out: list[s.AisleSummary] = []
        for a_code, racks in aisles.items():
            aisle_out.append(
                s.AisleSummary(
                    aisle_code=a_code,
                    aisle_name=aisle_names.get((w_code, a_code)),
                    rack_count=len(racks),
                    occupancy=_sum(r.occupancy for r in racks),
                    racks=racks,
                )
            )
        warehouses.append(
            s.WarehouseSummary(
                warehouse_code=w_code,
                warehouse_name=names.get(w_code),
                aisle_count=len(aisle_out),
                rack_count=sum(a.rack_count for a in aisle_out),
                occupancy=_sum(a.occupancy for a in aisle_out),
                aisles=aisle_out,
            )
        )

    return s.TopologyOut(
        generated_at=datetime.now(UTC),
        occupancy=_sum(w.occupancy for w in warehouses),
        warehouses=warehouses,
    )


# --- rack detail ------------------------------------------------------------
async def get_master(
    session: AsyncSession, warehouse_code: str, aisle_code: str, rack_code: str
) -> m.RackMaster:
    master = await session.scalar(
        select(m.RackMaster).where(
            m.RackMaster.warehouse_code == warehouse_code,
            m.RackMaster.aisle_code == aisle_code,
            m.RackMaster.rack_code == rack_code,
            m.RackMaster.status == "active",
        )
    )
    if master is None:
        raise NotFoundError(f"rack {warehouse_code}/{aisle_code}/{rack_code}")
    return master


async def rack_detail(
    session: AsyncSession, warehouse_code: str, aisle_code: str, rack_code: str
) -> s.RackDetailOut:
    master = await get_master(session, warehouse_code, aisle_code, rack_code)
    slots = (
        await session.scalars(
            select(m.Rack).where(
                m.Rack.warehouse_code == warehouse_code,
                m.Rack.aisle_code == aisle_code,
                m.Rack.rack_code == rack_code,
                m.Rack.status == "active",
            )
        )
    ).all()
    by_key = {(r.shelf_no, r.row_no, r.tray_no): r for r in slots}

    shelves: list[s.ShelfOut] = []
    for shelf_no in range(master.shelf_count, 0, -1):  # top shelf first
        rows: list[s.RowOut] = []
        for row_no in range(1, master.row_count + 1):
            trays: list[s.TrayOut] = []
            for tray_no in range(1, master.tray_count + 1):
                slot = by_key.get((shelf_no, row_no, tray_no))
                code = m.location_code(rack_code, shelf_no, row_no, tray_no)
                if slot is None:
                    # master widened but not yet materialised — still available
                    trays.append(
                        s.TrayOut(id=None, tray_no=tray_no, code=code, state="empty")
                    )
                else:
                    trays.append(
                        s.TrayOut(
                            id=slot.id,
                            tray_no=tray_no,
                            code=code,
                            state=slot.slot_state,  # type: ignore[arg-type]
                            occupied_by_model=slot.occupied_by_model,
                            date_of_occupied=slot.date_of_occupied,
                            location_name=slot.location_name,
                            notes=slot.notes,
                        )
                    )
            rows.append(
                s.RowOut(
                    row_no=row_no,
                    label=f"R{row_no}",
                    occupancy=_occupancy(
                        len(trays),
                        sum(1 for t in trays if t.state == "occupied"),
                        sum(1 for t in trays if t.state == "reserved"),
                        sum(1 for t in trays if t.state == "blocked"),
                    ),
                    trays=trays,
                )
            )
        shelves.append(
            s.ShelfOut(
                shelf_no=shelf_no,
                label=f"S{shelf_no}",
                occupancy=_sum(r.occupancy for r in rows),
                rows=rows,
            )
        )

    occ = _sum(sh.occupancy for sh in shelves)
    return s.RackDetailOut(
        id=master.id,
        warehouse_code=master.warehouse_code,
        warehouse_name=master.warehouse_name,
        aisle_code=master.aisle_code,
        aisle_name=master.aisle_name,
        rack_code=master.rack_code,
        rack_name=master.rack_name,
        position=master.position,
        side=master.side,
        shelf_count=master.shelf_count,
        row_count=master.row_count,
        tray_count=master.tray_count,
        occupancy=occ,
        state=_rack_state(occ),
        generated_at=datetime.now(UTC),
        shelves=shelves,
    )


# --- locate me --------------------------------------------------------------
def _ergonomic_shelf(shelf_count: int) -> int:
    """The shelf closest to waist height — cheapest to reach into."""
    return max(1, round(shelf_count * 0.4))


def _score(master: m.RackMaster, slot: m.Rack) -> tuple[float, str]:
    """Walk-and-reach cost for one empty slot, plus why it ranked there."""
    best_shelf = _ergonomic_shelf(master.shelf_count)
    walk = (master.position - 1) * RACK_PITCH_M + (slot.tray_no - 1) * TRAY_PITCH_M
    reach = abs(slot.shelf_no - best_shelf) * SHELF_STEP_M
    depth = (slot.row_no - 1) * ROW_DEPTH_M
    distance = round(walk + reach + depth, 1)

    parts = []
    if slot.shelf_no == best_shelf:
        parts.append("waist-height shelf")
    elif slot.shelf_no > best_shelf:
        parts.append(f"shelf {slot.shelf_no}, overhead reach")
    else:
        parts.append(f"shelf {slot.shelf_no}, low reach")
    parts.append("front row" if slot.row_no == 1 else f"row {slot.row_no} back")
    parts.append(f"rack {master.rack_code} at {round((master.position - 1) * RACK_PITCH_M, 1)} m into the aisle")
    return distance, ", ".join(parts)


async def locate(
    session: AsyncSession,
    *,
    warehouse_code: str | None = None,
    aisle_code: str | None = None,
    rack_code: str | None = None,
    limit: int = 5,
) -> s.LocateOut:
    """Rank the free slots the caller may use. The backend owns the ordering."""
    masters = await active_masters(
        session,
        warehouse_code=warehouse_code,
        aisle_code=aisle_code,
        rack_code=rack_code,
    )
    by_rack = {
        (mm.warehouse_code, mm.aisle_code, mm.rack_code): mm for mm in masters
    }
    if not by_rack:
        return s.LocateOut(
            generated_at=datetime.now(UTC),
            warehouse_code=warehouse_code,
            aisle_code=aisle_code,
            rack_code=rack_code,
            total_empty=0,
            recommendations=[],
        )

    stmt = select(m.Rack).where(
        m.Rack.status == "active",
        m.Rack.slot_state == "empty",
    )
    if warehouse_code:
        stmt = stmt.where(m.Rack.warehouse_code == warehouse_code)
    if aisle_code:
        stmt = stmt.where(m.Rack.aisle_code == aisle_code)
    if rack_code:
        stmt = stmt.where(m.Rack.rack_code == rack_code)

    candidates = (await session.scalars(stmt)).all()
    scored: list[tuple[float, str, m.Rack]] = []
    for slot in candidates:
        master = by_rack.get(
            (slot.warehouse_code, slot.aisle_code, slot.rack_code)
        )
        if master is None:  # slot outside any active master — not offerable
            continue
        distance, reason = _score(master, slot)
        scored.append((distance, reason, slot))

    scored.sort(key=lambda t: (t[0], t[2].rack_code, t[2].shelf_no, t[2].row_no, t[2].tray_no))

    recommendations = [
        s.Recommendation(
            rank=i,
            score=round(100 / (1 + distance), 1),
            distance_m=distance,
            id=slot.id,
            code=slot.code,
            warehouse_code=slot.warehouse_code,
            aisle_code=slot.aisle_code,
            rack_code=slot.rack_code,
            shelf_no=slot.shelf_no,
            row_no=slot.row_no,
            tray_no=slot.tray_no,
            location_name=slot.location_name,
            reason=reason,
        )
        for i, (distance, reason, slot) in enumerate(scored[:limit], start=1)
    ]
    return s.LocateOut(
        generated_at=datetime.now(UTC),
        warehouse_code=warehouse_code,
        aisle_code=aisle_code,
        rack_code=rack_code,
        total_empty=len(scored),
        recommendations=recommendations,
    )


# --- search -----------------------------------------------------------------
#: K-S4-R2-T05 / k s4 r2 t5 / K/S4/R2/T05 — separators and padding optional
_CODE_RE = re.compile(
    r"^\s*(?P<rack>[A-Za-z0-9]+)\s*[-/ ]?\s*S(?P<shelf>\d+)\s*[-/ ]?\s*"
    r"R(?P<row>\d+)\s*[-/ ]?\s*T(?P<tray>\d+)\s*$",
    re.IGNORECASE,
)


def parse_code(query: str) -> tuple[str, int, int, int] | None:
    match = _CODE_RE.match(query)
    if not match:
        return None
    return (
        match["rack"].upper(),
        int(match["shelf"]),
        int(match["row"]),
        int(match["tray"]),
    )


async def resolve_code(
    session: AsyncSession,
    query: str,
    *,
    warehouse_code: str | None = None,
    aisle_code: str | None = None,
) -> s.ResolveOut:
    parsed = parse_code(query)
    stmt = select(m.Rack).where(m.Rack.status == "active")
    if warehouse_code:
        stmt = stmt.where(m.Rack.warehouse_code == warehouse_code)
    if aisle_code:
        stmt = stmt.where(m.Rack.aisle_code == aisle_code)

    if parsed:
        rack_code, shelf_no, row_no, tray_no = parsed
        stmt = stmt.where(
            func.upper(m.Rack.rack_code) == rack_code,
            m.Rack.shelf_no == shelf_no,
            m.Rack.row_no == row_no,
            m.Rack.tray_no == tray_no,
        )
    else:
        # fall back to "where is this model?" / a location label
        term = f"%{query.strip()}%"
        stmt = stmt.where(
            or_(
                m.Rack.occupied_by_model.ilike(term),
                m.Rack.location_name.ilike(term),
            )
        ).order_by(m.Rack.rack_code, m.Rack.shelf_no, m.Rack.row_no, m.Rack.tray_no)

    slot = await session.scalar(stmt.limit(1))
    return s.ResolveOut(
        query=query,
        matched=slot is not None,
        slot=s.RackOut.model_validate(slot) if slot else None,
    )
