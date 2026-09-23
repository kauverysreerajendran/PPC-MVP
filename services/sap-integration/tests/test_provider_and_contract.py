"""Unit tests that need no database."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from app.providers import get_provider
from app.providers.mock import MockSapProvider
from app.schemas import SapInwardRecordOut, SapInwardRecordUpdate
from app.service import COLUMNS
from pydantic import ValidationError


def test_get_provider_returns_mock() -> None:
    assert isinstance(get_provider(), MockSapProvider)


def test_mock_provider_is_deterministic_and_respects_count() -> None:
    p = MockSapProvider()
    a = asyncio.run(p.fetch_inward_records(count=7))
    b = asyncio.run(p.fetch_inward_records(count=7))
    assert len(a) == 7
    assert [r.sap_reference_id for r in a] == [r.sap_reference_id for r in b]
    # natural key is unique within a batch
    assert len({r.sap_reference_id for r in a}) == 7


def test_column_defs_reference_real_response_fields() -> None:
    fields = set(SapInwardRecordOut.model_fields)
    for col in COLUMNS:
        assert col.key in fields, col.key
    # editable columns: the app-owned remark, plus the lot qty an operator
    # corrects when SAP sends an odd one (it must split into front/back cases)
    editable = {c.key for c in COLUMNS if c.editable}
    assert editable == {"remark", "quantity"}
    # every editable column is actually accepted by the PATCH contract
    assert editable <= set(SapInwardRecordUpdate.model_fields)


def test_lot_qty_update_accepts_only_whole_even_quantities() -> None:
    assert SapInwardRecordUpdate(quantity=Decimal(244)).quantity == Decimal(244)
    for bad in ("245", "244.5", "0", "-2"):
        with pytest.raises(ValidationError):
            SapInwardRecordUpdate(quantity=Decimal(bad))


def test_mock_provider_default_batch_matches_the_mvp_size() -> None:
    from app.seed import SEED_COUNT

    assert len(asyncio.run(MockSapProvider().fetch_inward_records())) == SEED_COUNT


def test_seed_builds_exactly_twenty_stable_records() -> None:
    from app.seed import SEED_COUNT, build_records

    anchor = datetime(2026, 3, 10, 7, 45, tzinfo=UTC)
    a = build_records(anchor=anchor)
    b = build_records(anchor=anchor)

    assert len(a) == SEED_COUNT == 20
    # Same anchor, byte-identical batch: a re-seed writes no change.
    assert a == b
    # The natural key the upsert dedupes on is unique and not date-derived.
    refs = [r.sap_reference_id for r in a]
    assert len(set(refs)) == 20
    assert refs[0] == "SAP-MVP-001"
    assert refs[-1] == "SAP-MVP-020"


def test_seed_reference_ids_do_not_move_with_the_calendar() -> None:
    from app.seed import build_records

    march = build_records(anchor=datetime(2026, 3, 10, tzinfo=UTC))
    july = build_records(anchor=datetime(2026, 7, 1, tzinfo=UTC))
    assert [r.sap_reference_id for r in march] == [r.sap_reference_id for r in july]
    # …but the lines stay recent, so only the dates differ.
    assert march[0].transaction_date != july[0].transaction_date


def test_feed_quantities_are_whole_and_even() -> None:
    """Every line the feed produces must split equally into front/back cases."""
    from app.seed import build_records

    rows = asyncio.run(MockSapProvider().fetch_inward_records(count=40))
    rows += build_records(anchor=datetime(2026, 3, 10, 7, 45, tzinfo=UTC))
    for r in rows:
        assert r.quantity is not None
        assert r.quantity == r.quantity.to_integral_value(), r.sap_reference_id
        assert int(r.quantity) % 2 == 0, (r.sap_reference_id, r.quantity)


# --- lot qty: whole and even, at ingest as well as on edit -----------------
#
# Test values are deliberately unlike anything the feed produces (it only makes
# even numbers from 26 up), and nothing here opens a database connection.


def test_to_even_whole_rounds_to_the_nearest_even_number() -> None:
    from app.lotqty import to_even_whole

    assert to_even_whole(Decimal("467")) == Decimal(468)
    assert to_even_whole(Decimal("353.4")) == Decimal(354)
    assert to_even_whole(Decimal("468")) == Decimal(468)
    assert to_even_whole(None) is None
    # ties round up, so a correction never shrinks the lot by more than one
    assert to_even_whole(Decimal("465.5")) == Decimal(466)
    assert to_even_whole(Decimal("1.5")) == Decimal(2)


def test_is_even_whole_accepts_only_whole_even_numbers() -> None:
    from app.lotqty import is_even_whole

    assert is_even_whole(Decimal("468"))
    assert is_even_whole(None)  # NULL stays NULL, and is not a violation
    assert not is_even_whole(Decimal("467"))
    assert not is_even_whole(Decimal("353.4"))


def test_ingest_rounds_an_odd_lot_qty_and_warns(caplog) -> None:
    """A feed row cannot be refused back to SAP, so it is corrected and logged."""
    import logging

    from app.service import _normalise_lot_qty

    class Row:
        def __init__(self, ref, qty):
            self.sap_reference_id = ref
            self.quantity = qty

    rows = [Row("TEST-ODD", Decimal("467")), Row("TEST-EVEN", Decimal("468"))]
    with caplog.at_level(logging.WARNING, logger="sap-integration.service"):
        _normalise_lot_qty(rows)

    assert rows[0].quantity == Decimal(468)
    assert rows[1].quantity == Decimal(468)  # untouched
    # only the corrected row is reported
    assert len(caplog.records) == 1
    assert "TEST-ODD" in caplog.records[0].getMessage()


def test_edit_endpoint_still_refuses_an_odd_lot_qty() -> None:
    """The ingest guard rounds; a person's edit is still refused outright."""
    with pytest.raises(ValidationError):
        SapInwardRecordUpdate(quantity=Decimal("467"))
    with pytest.raises(ValidationError):
        SapInwardRecordUpdate(quantity=Decimal("353.4"))
    assert SapInwardRecordUpdate(quantity=Decimal("468")).quantity == Decimal(468)
