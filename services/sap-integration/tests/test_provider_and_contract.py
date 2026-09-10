"""Unit tests that need no database."""

from __future__ import annotations

import asyncio

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
