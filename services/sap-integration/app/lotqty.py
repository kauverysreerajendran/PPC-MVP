"""What a lot quantity is allowed to be — the one place that rule lives.

A lot is split down the middle into front and back cases, so a lot qty that is
not a whole even number can never divide equally. The edit endpoint has always
refused one (``SapInwardRecordUpdate._even_lot``); this module states the same
rule for the ingest path, where a feed row cannot simply be rejected back to
SAP, and for the migration that repairs rows written before the rule existed.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

#: a lot qty is stored as Numeric(18, 3); whole numbers compare against this
_ONE = Decimal(1)


def is_even_whole(value: Decimal | None) -> bool:
    """True when ``value`` is a whole, even number (or NULL, which is allowed)."""
    if value is None:
        return True
    return value == value.to_integral_value() and int(value) % 2 == 0


def to_even_whole(value: Decimal | None) -> Decimal | None:
    """The nearest even whole number, ties rounding up.

    467 -> 468, 353.4 -> 354, 468 -> 468, NULL -> NULL. Halfway cases go up
    (465 -> 466), so the correction never shrinks a lot below what SAP said by
    more than one.
    """
    if value is None:
        return None
    whole = value.quantize(_ONE, rounding=ROUND_HALF_UP)
    return whole if int(whole) % 2 == 0 else whole + _ONE
