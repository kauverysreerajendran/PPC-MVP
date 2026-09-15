"""Unit tests that need no database."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from app.providers import get_provider
from app.providers.mock import MockSapProvider
from app.schemas import SapInwardRecordOut
from app.service import COLUMNS


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
    # the only editable column is the app-owned one
    editable = {c.key for c in COLUMNS if c.editable}
    assert editable == {"remark"}


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
