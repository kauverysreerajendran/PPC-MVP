"""How much a tray holds — the one place that rule lives.

A line's received stock goes into trays; a tray holds a bounded amount, and
the last tray of a line is usually partial. Placement mode sends the line's
``received_qty`` and fills trays by *quantity* (25 qty per tray by default);
older callers that omit it are still judged by *pieces*. Either way every
check that a tray is not being overfilled comes through here, so the number
is stated once.

Capacity is data-first: if the tray slot itself carries a capacity (the
Masterdata tray master's ``qty_capacity``, mirrored onto a slot), that wins;
otherwise the default below applies.
"""

from __future__ import annotations

from math import ceil
from typing import Any

#: pieces one tray holds when neither the slot nor the tray master says otherwise
DEFAULT_TRAY_CAPACITY_PIECES = 25


def tray_capacity(slot: Any = None) -> int:
    """Pieces the given tray slot holds — its own capacity, else the default."""
    own = getattr(slot, "qty_capacity", None) if slot is not None else None
    if own is None:
        return DEFAULT_TRAY_CAPACITY_PIECES
    try:
        value = int(own)
    except (TypeError, ValueError):
        return DEFAULT_TRAY_CAPACITY_PIECES
    return value if value >= 1 else DEFAULT_TRAY_CAPACITY_PIECES


def trays_needed(pieces: int, capacity: int | None = None) -> int:
    """Trays it takes to hold ``pieces`` — the last one may be partial."""
    cap = capacity if capacity and capacity >= 1 else DEFAULT_TRAY_CAPACITY_PIECES
    return ceil(pieces / cap) if pieces > 0 else 0
