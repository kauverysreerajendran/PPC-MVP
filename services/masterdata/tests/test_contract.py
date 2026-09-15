"""Contract / wiring tests that need no database."""

from __future__ import annotations

import os

# Import-time only: Settings requires a DSN. Not a real credential, never connected.
os.environ.setdefault(
    "MASTERDATA_DATABASE_URL",
    "postgresql+asyncpg://test:test@localhost:5432/masterdata_test",
)

from app.crud import CrudRepository  # noqa: E402
from app.main import app  # noqa: E402
from app.models import MasterModel, SapOutward  # noqa: E402
from app.schemas import MasterModelOut, SapOutwardOut  # noqa: E402

PREFIX = "/api/v1/masterdata"


def _paths() -> set[str]:
    return set(app.openapi()["paths"].keys())


def test_all_resources_expose_full_rest_surface() -> None:
    paths = _paths()
    for resource in (
        "models",
        "plating-colors",
        "vendors",
        "locations",
        "sap-outwards",
        "trays",
        "boxes",
    ):
        assert f"{PREFIX}/{resource}" in paths, resource
        assert f"{PREFIX}/{resource}/{{obj_id}}" in paths, resource
    methods = app.openapi()["paths"][f"{PREFIX}/models"]
    assert set(methods) == {"get", "post"}
    item_methods = app.openapi()["paths"][f"{PREFIX}/models/{{obj_id}}"]
    assert set(item_methods) == {"get", "put", "delete"}


def test_health_endpoint_registered() -> None:
    assert f"{PREFIX}/health" in _paths()


def test_sap_inward_surface() -> None:
    paths = _paths()
    for path in (
        f"{PREFIX}/sap-inward/lines",
        f"{PREFIX}/sap-inward/scan",
        f"{PREFIX}/sap-inward/{{obj_id}}/close",
        f"{PREFIX}/sap-inward/{{obj_id}}/reset",
        f"{PREFIX}/sap-inward/{{obj_id}}/verify",
        f"{PREFIX}/sap-inward/{{obj_id}}/scans",
    ):
        assert path in paths, path


def test_inward_computed_fields() -> None:
    """Front + back come back attached: expected pieces = front-case count,
    the lot qty splits evenly across them, shortage = qty - received."""
    from datetime import datetime, timezone

    now = datetime(2026, 9, 10, tzinfo=timezone.utc)
    base = {
        "id": "00000000-0000-0000-0000-000000000001",
        "sap_reference_id": "SAP-1",
        "sap_document_no": None,
        "transaction_date": now,
        "dc_no": "DC-1",
        "po_no": "PO-1",
        "material_no": None,
        "model_no": "90148",
        "vendor_code": None,
        "batch_no": None,
        "lot_no": "LOT-1",
        "quantity": "270",
        "movement_type": "101",
        "source_system": "SAP-ECC",
        "box_uid": "BUID-1",
        "tray_id": None,
        "tray_type": "FC + BC",
        "no_of_trays": 20,
        "front_case_trays": 10,
        "back_case_trays": 10,
        "outward_status": "DISPATCHED",
        "model_id": None,
        "vendor_id": None,
        "plating_color_id": None,
        "location_id": None,
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }

    pending = SapOutwardOut(**base)
    assert pending.expected_pieces == 10
    assert pending.qty_per_piece == 27
    assert pending.shortage_pieces == 10
    assert pending.shortage_qty == 270

    partial = SapOutwardOut(**base, received_pieces=4, received_qty="108")
    assert partial.shortage_pieces == 6
    assert partial.shortage_qty == 162

    # no case-tray split -> fall back to no_of_trays / 2
    no_cases = SapOutwardOut(
        **{**base, "front_case_trays": None, "back_case_trays": None}
    )
    assert no_cases.expected_pieces == 10


def test_uneven_lot_splits_into_whole_parts() -> None:
    """Parts are never fractional: 467 over 19 pieces is 24 per piece with the
    first 11 pieces carrying 25, and all 19 add back up to the lot."""
    from decimal import Decimal

    from app.schemas import piece_qty, received_qty_for, split_lot

    lot = Decimal("467")
    assert split_lot(lot, 19) == (24, 11)
    assert [piece_qty(lot, 19, n) for n in (1, 11, 12, 19)] == [25, 25, 24, 24]
    assert sum(piece_qty(lot, 19, n) for n in range(1, 20)) == 467
    assert received_qty_for(lot, 19, 1) == 25
    assert received_qty_for(lot, 19, 12) == 11 * 25 + 24
    assert received_qty_for(lot, 19, 19) == lot
    assert received_qty_for(lot, 19, 0) == 0


def test_out_schema_matches_model_columns() -> None:
    for model, schema in ((MasterModel, MasterModelOut), (SapOutward, SapOutwardOut)):
        cols = {c.name for c in model.__table__.columns}
        for field in schema.model_fields:
            assert field in cols, f"{schema.__name__}.{field} not a column of {model.__name__}"


def test_crud_repo_declares_unique_fields() -> None:
    repo = CrudRepository(
        MasterModel,
        searchable=(MasterModel.model_no,),
        sortable={"created_at": MasterModel.created_at},
        unique_fields=("model_no",),
    )
    assert repo.unique_fields == ("model_no",)
    assert repo.default_sort == "created_at"


# --- POST /sap-inward/{id}/verify ----------------------------------------
ALL_DOCS = ["gi_slip", "titan_challan", "vendor_challan", "qed_sheet"]


def _verify_client(monkeypatch, received_pieces: int = 4):
    """TestClient with the DB session, auth and Status service stubbed out.
    Returns the client, the verify URL and the list of reported events."""
    import uuid
    from datetime import datetime, timezone
    from decimal import Decimal

    from fastapi.testclient import TestClient

    from app import api, status_client
    from app.db import get_session
    from app.security import Principal, current_principal

    now = datetime(2026, 9, 14, tzinfo=timezone.utc)
    row = SapOutward(
        id=uuid.UUID(int=1), sap_reference_id="SAP-1", sap_document_no="GI-1",
        transaction_date=now, dc_no="DC-1", po_no="PO-1", material_no="M-1",
        model_no="90148", vendor_code="V-1", batch_no="B-1", lot_no="LOT-1",
        quantity=Decimal("270"), movement_type="313", source_system="SAP-ECC",
        box_uid="BUID-1", tray_id=None, tray_type="FC + BC", no_of_trays=20,
        front_case_trays=10, back_case_trays=10, outward_status="DISPATCHED",
        model_id=None, vendor_id=None, plating_color_id=None, location_id=None,
        status="active", created_at=now, updated_at=now,
        received_pieces=received_pieces, received_qty=Decimal(27 * received_pieces),
        inward_status="PARTIAL" if received_pieces else None, inward_last_scan_at=now,
    )
    reported: list[dict] = []

    async def fake_get(_session, _obj_id):
        return row

    async def fake_report(events):
        reported.extend(events)
        return [{"line": {"sap_reference_id": "SAP-1", "stage": "inward", "code": "VERIFIED",
                          "label": "Verified", "tone": "success", "changed_at": now.isoformat()}}]

    async def fake_session():
        yield None

    monkeypatch.setattr(api.outwards_repo, "get", fake_get)
    monkeypatch.setattr(status_client, "report", fake_report)
    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[current_principal] = lambda: Principal(subject="dev", role=None)
    return TestClient(app), f"{PREFIX}/sap-inward/{row.id}/verify", reported


def test_verify_without_body_keeps_old_note(monkeypatch) -> None:
    client, url, reported = _verify_client(monkeypatch)
    try:
        resp = client.post(url)
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    assert resp.json()["code"] == "VERIFIED"
    assert reported[0]["note"] == "4/10 pieces · received 108 of 270"


def test_verify_with_documents_appends_docs_suffix(monkeypatch) -> None:
    client, url, reported = _verify_client(monkeypatch)
    try:
        resp = client.post(url, json={"documents_checked": ALL_DOCS})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    note = reported[0]["note"]
    assert note == "4/10 pieces · received 108 of 270 · docs: GI ✓ DC ✓ VDC ✓ QED ✓"
    assert len(note) <= 255


def test_verify_with_missing_document_is_422(monkeypatch) -> None:
    client, url, reported = _verify_client(monkeypatch)
    try:
        resp = client.post(url, json={"documents_checked": ALL_DOCS[:3]})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 422, resp.text
    assert resp.json()["error"]["code"] == "validation_error"
    assert reported == []


def test_verify_nothing_received_is_409(monkeypatch) -> None:
    client, url, reported = _verify_client(monkeypatch, received_pieces=0)
    try:
        resp = client.post(url, json={"documents_checked": ALL_DOCS})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 409, resp.text
    assert "scan a box first" in resp.json()["error"]["message"]
    assert reported == []


# --- POST /sap-inward/scan -----------------------------------------------
def _scan_client(monkeypatch, **overrides):
    """TestClient for scan / reset with the DB session, auth and Status service
    stubbed out. Lot 300 over 4 pieces (75 per piece). Returns the client, the
    outward row the endpoints act on and the list of reported events."""
    import uuid
    from datetime import datetime, timezone
    from decimal import Decimal

    from fastapi.testclient import TestClient

    from app import api, status_client
    from app.db import get_session
    from app.security import Principal, current_principal

    now = datetime(2026, 9, 14, tzinfo=timezone.utc)
    fields = dict(
        id=uuid.UUID(int=2), sap_reference_id="SAP-2", sap_document_no="GI-2",
        transaction_date=now, dc_no="DC-2", po_no="PO-2", material_no="M-2",
        model_no="90148", vendor_code="V-1", batch_no="B-2", lot_no="LOT-2",
        quantity=Decimal("300"), movement_type="313", source_system="SAP-ECC",
        box_uid="BUID-2", tray_id=None, tray_type="FC + BC", no_of_trays=8,
        front_case_trays=4, back_case_trays=4, outward_status="DISPATCHED",
        model_id=None, vendor_id=None, plating_color_id=None, location_id=None,
        status="active", created_at=now, updated_at=now, received_pieces=0,
        received_qty=None, inward_status=None, inward_last_scan_at=None, inward_scans=[],
    )
    fields.update(overrides)
    row = SapOutward(**fields)
    reported: list[dict] = []

    class FakeSession:
        async def scalar(self, _stmt):
            return row

        async def flush(self):
            return None

    async def fake_session():
        yield FakeSession()

    async def fake_get(_session, _obj_id):
        return row

    async def fake_report(events):
        reported.extend(events)
        return []

    monkeypatch.setattr(api.outwards_repo, "get", fake_get)
    monkeypatch.setattr(status_client, "report", fake_report)
    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[current_principal] = lambda: Principal(subject="dev", role=None)
    return TestClient(app), row, reported


SCAN_URL = f"{PREFIX}/sap-inward/scan"


def test_scan_without_qty_records_one_piece_as_before(monkeypatch) -> None:
    client, row, reported = _scan_client(monkeypatch)
    try:
        resp = client.post(SCAN_URL, json={"box_uid": "BUID-2"})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["message"] == "90148 · piece 1/4 · received 75 of 300 · shortage 225"
    out = body["outward"]
    assert (out["received_pieces"], out["received_qty"], out["shortage_qty"]) == (1, 75, 225)
    assert out["rejected_qty"] == 0
    assert out["inward_status"] == "PARTIAL"
    assert "inward_scans" not in out
    assert "entry_mode" not in row.inward_scans[0]
    assert reported[1]["note"] == "piece 1/4 scanned"


def test_scan_with_accepted_qty_records_the_entered_quantities(monkeypatch) -> None:
    client, row, reported = _scan_client(monkeypatch)
    try:
        resp = client.post(
            SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 150, "rejected_qty": 0}
        )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    out = resp.json()["outward"]
    assert out["received_qty"] == 150
    assert out["received_pieces"] == 2  # ceil(150 / 75)
    assert out["shortage_qty"] == 150
    assert out["rejected_qty"] == 0
    assert out["inward_status"] == "PARTIAL"
    entry = row.inward_scans[0]
    assert entry["entry_mode"] == "qty"
    assert (entry["front_cases"], entry["back_cases"]) == ("75", "75")
    assert (entry["accepted_qty"], entry["rejected_qty"]) == ("150", "0")
    assert [e["code"] for e in reported] == ["RECEIVED", "YET_TO_VERIFY"]
    assert reported[1]["note"] == "accepted 150 (75F/75B) · rejected 0 · shortage 150 of 300"


def test_scan_with_rejected_qty_accounts_for_the_whole_lot(monkeypatch) -> None:
    client, _row, _reported = _scan_client(monkeypatch)
    try:
        resp = client.post(
            SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 200, "rejected_qty": 100}
        )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    out = resp.json()["outward"]
    assert (out["received_qty"], out["rejected_qty"], out["shortage_qty"]) == (200, 100, 0)
    assert out["received_pieces"] == 3
    assert out["inward_status"] == "RECEIVED"


def test_scan_with_odd_accepted_qty_is_422(monkeypatch) -> None:
    client, _row, reported = _scan_client(monkeypatch)
    try:
        resp = client.post(SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 151})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 422, resp.text
    assert "split equally into front and back cases" in resp.text
    assert reported == []


def test_second_qty_entry_is_409(monkeypatch) -> None:
    client, _row, _reported = _scan_client(monkeypatch)
    try:
        first = client.post(SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 150})
        second = client.post(SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 100})
    finally:
        app.dependency_overrides.clear()
    assert first.status_code == 200, first.text
    assert second.status_code == 409, second.text
    assert "already recorded" in second.json()["error"]["message"]


def test_accepted_plus_rejected_over_the_lot_is_409(monkeypatch) -> None:
    client, row, reported = _scan_client(monkeypatch)
    try:
        resp = client.post(
            SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 200, "rejected_qty": 150}
        )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 409, resp.text
    assert "more than the lot qty 300" in resp.json()["error"]["message"]
    assert row.inward_scans == [] and reported == []


def test_reset_clears_the_qty_entry_and_allows_a_new_one(monkeypatch) -> None:
    client, row, _reported = _scan_client(monkeypatch)
    try:
        client.post(SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 150})
        reset = client.post(f"{PREFIX}/sap-inward/{row.id}/reset")
        again = client.post(SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 100})
    finally:
        app.dependency_overrides.clear()
    assert reset.status_code == 200, reset.text
    assert again.status_code == 200, again.text
    assert again.json()["outward"]["received_qty"] == 100
    assert len(row.inward_scans) == 1


def test_pieces_for_accepted() -> None:
    from decimal import Decimal

    from app.schemas import pieces_for_accepted

    lot = Decimal("300")
    assert pieces_for_accepted(lot, 4, Decimal("150")) == 2
    assert pieces_for_accepted(lot, 4, Decimal("2")) == 1  # min 1
    assert pieces_for_accepted(lot, 4, Decimal("300")) == 4  # max expected
    assert pieces_for_accepted(lot, 4, Decimal("0")) == 0
    assert pieces_for_accepted(Decimal("3"), 4, Decimal("2")) == 2  # lot below piece count
