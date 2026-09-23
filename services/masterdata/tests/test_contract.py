"""Contract / wiring tests that need no database."""

from __future__ import annotations

import os
import typing

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
    outward row the endpoints act on, the list of reported events and the list
    of rows added to the session (the shortage back-orders)."""
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

    added: list = []

    class FakeSession:
        """Stands in for the database. Three different queries reach it, told
        apart by the column each one filters on: the Box UID lookup, the
        uniqueness check a back-order reference is generated against, and the
        back-order lookup on Reset. `flush` fills in the primary key and the
        column defaults a newly added row relies on."""

        async def scalar(self, stmt):
            sql = str(stmt)
            if "box_uid = " in sql:
                return row
            if "parent_sap_reference_id" in sql:
                return next(
                    (
                        o
                        for o in added
                        if o.parent_sap_reference_id == row.sap_reference_id
                        and o.status == "active"
                    ),
                    None,
                )
            if "sap_reference_id = " in sql:
                wanted = next(iter(stmt.compile().params.values()))
                return next((o.id for o in added if o.sap_reference_id == wanted), None)
            return None

        def add(self, obj):
            added.append(obj)

        async def flush(self):
            for o in added:
                o.id = o.id or uuid.uuid4()
                o.status = o.status or "active"
                o.source_system = o.source_system or "SAP-ECC"
                o.received_pieces = o.received_pieces or 0
                o.inward_scans = o.inward_scans or []
                o.created_at = o.created_at or now
                o.updated_at = o.updated_at or now

    session = FakeSession()

    async def fake_session():
        yield session

    async def fake_get(_session, _obj_id):
        return row

    async def fake_report(events):
        reported.extend(events)
        return []

    monkeypatch.setattr(api.outwards_repo, "get", fake_get)
    monkeypatch.setattr(status_client, "report", fake_report)
    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[current_principal] = lambda: Principal(subject="dev", role=None)
    return TestClient(app), row, reported, added


SCAN_URL = f"{PREFIX}/sap-inward/scan"


def test_scan_without_qty_records_one_piece_as_before(monkeypatch) -> None:
    client, row, reported, _added = _scan_client(monkeypatch)
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
    client, row, reported, _added = _scan_client(monkeypatch)
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
    # accepted 150 of lot 300 leaves a shortage of 150, so a back-order line is
    # raised and reported Pending alongside the two statuses of the parent
    assert [e["code"] for e in reported] == ["RECEIVED", "YET_TO_VERIFY", "PENDING"]
    assert reported[1]["note"] == "accepted 150 (75F/75B) · rejected 0 · shortage 150 of 300"


def test_scan_with_rejected_qty_accounts_for_the_whole_lot(monkeypatch) -> None:
    client, _row, _reported, _added = _scan_client(monkeypatch)
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
    client, _row, reported, _added = _scan_client(monkeypatch)
    try:
        resp = client.post(SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 151})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 422, resp.text
    assert "split equally into front and back cases" in resp.text
    assert reported == []


def test_second_qty_entry_is_409(monkeypatch) -> None:
    client, _row, _reported, _added = _scan_client(monkeypatch)
    try:
        first = client.post(SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 150})
        second = client.post(SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 100})
    finally:
        app.dependency_overrides.clear()
    assert first.status_code == 200, first.text
    assert second.status_code == 409, second.text
    assert "already recorded" in second.json()["error"]["message"]


def test_accepted_plus_rejected_over_the_lot_is_409(monkeypatch) -> None:
    client, row, reported, _added = _scan_client(monkeypatch)
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
    client, row, _reported, _added = _scan_client(monkeypatch)
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


# --- shortage back-orders raised by a qty entry --------------------------
def test_shortage_raises_one_pending_backorder_and_leaves_the_parent_alone(
    monkeypatch,
) -> None:
    """Lot 300, accepted 60, rejected 0 -> shortage 240: a NEW outward line for
    240, Pending, no Box UID, pointing back at the line it came from — and the
    received line itself is untouched."""
    client, row, reported, added = _scan_client(monkeypatch)
    try:
        resp = client.post(
            SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 60, "rejected_qty": 0}
        )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text

    assert len(added) == 1
    bo = added[0]
    lot, accepted, rejected = 300, 60, 0
    assert bo.quantity == lot - accepted - rejected == 240
    assert bo.origin == "SHORTAGE"
    assert bo.parent_sap_reference_id == row.sap_reference_id
    assert bo.sap_reference_id == f"{row.sap_reference_id}-S1" != row.sap_reference_id
    assert bo.outward_status == "PENDING"
    assert bo.box_uid is None
    assert (bo.tray_id, bo.tray_type, bo.no_of_trays) == (None, None, None)
    assert (bo.received_pieces, bo.inward_status) == (0, None)
    # the SAP identifiers are the parent's, verbatim
    for field in ("dc_no", "po_no", "model_no", "vendor_code", "batch_no", "movement_type"):
        assert getattr(bo, field) == getattr(row, field), field

    # the parent keeps its Box UID, its dispatched/received figures and its lot
    assert (row.box_uid, row.quantity, row.received_qty) == ("BUID-2", 300, 60)
    assert row.outward_status == "DISPATCHED"

    body = resp.json()
    assert body["backorder_sap_reference_id"] == bo.sap_reference_id
    assert body["backorder"]["quantity"] == 240
    assert f"shortage 240 of 300 → new line {bo.sap_reference_id}" in body["message"]
    assert reported[-1]["code"] == "PENDING"
    assert reported[-1]["sap_reference_id"] == bo.sap_reference_id
    assert row.sap_reference_id in reported[-1]["note"]


def test_no_shortage_raises_no_backorder(monkeypatch) -> None:
    """accepted + rejected = lot -> nothing is owed, so nothing is created."""
    client, _row, reported, added = _scan_client(monkeypatch)
    try:
        resp = client.post(
            SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 200, "rejected_qty": 100}
        )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    assert added == []
    assert resp.json()["backorder"] is None
    assert resp.json()["backorder_sap_reference_id"] is None
    assert [e["code"] for e in reported] == ["RECEIVED", "YET_TO_VERIFY"]


def test_a_second_record_attempt_creates_no_second_backorder(monkeypatch) -> None:
    client, row, _reported, added = _scan_client(monkeypatch)
    try:
        first = client.post(SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 60})
        second = client.post(SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 60})
    finally:
        app.dependency_overrides.clear()
    assert first.status_code == 200, first.text
    assert second.status_code == 409, second.text
    assert len(added) == 1


def test_reset_voids_the_backorder_and_a_new_record_raises_a_fresh_one(monkeypatch) -> None:
    client, row, _reported, added = _scan_client(monkeypatch)
    try:
        client.post(SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 60})
        reset = client.post(f"{PREFIX}/sap-inward/{row.id}/reset")
        again = client.post(SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 60})
    finally:
        app.dependency_overrides.clear()
    assert reset.status_code == 200, reset.text
    assert added[0].status == "inactive"  # voided, never orphaned
    assert again.status_code == 200, again.text
    # the voided reference is taken, so the fresh line gets the next suffix
    assert len(added) == 2
    assert [o.sap_reference_id for o in added] == ["SAP-2-S1", "SAP-2-S2"]
    assert added[1].status == "active"


def test_reset_is_refused_once_the_backorder_is_dispatched(monkeypatch) -> None:
    client, row, _reported, added = _scan_client(monkeypatch)
    try:
        client.post(SCAN_URL, json={"box_uid": "BUID-2", "accepted_qty": 60})
        added[0].box_uid = "BUID-9"
        added[0].outward_status = "DISPATCHED"
        reset = client.post(f"{PREFIX}/sap-inward/{row.id}/reset")
    finally:
        app.dependency_overrides.clear()
    assert reset.status_code == 409, reset.text
    message = reset.json()["error"]["message"]
    assert "SAP-2-S1" in message and "already been dispatched" in message
    assert added[0].status == "active"
    # the receiving entry itself is left alone
    assert len(row.inward_scans) == 1


def test_pending_is_an_allowed_outward_status_everywhere() -> None:
    """The CHECK constraint, the schema Literal and the status master have to
    agree, or the new line cannot be written / serialised / labelled."""
    from app.models import OUTWARD_STATUS_VALUES
    from app.schemas import OutwardStatus

    assert "PENDING" in OUTWARD_STATUS_VALUES
    assert "PENDING" in typing.get_args(OutwardStatus)
    checks = [
        str(c.sqltext)
        for c in SapOutward.__table__.constraints
        if hasattr(c, "sqltext") and "outward_status" in str(c.sqltext)
    ]
    assert checks and all("PENDING" in text for text in checks)


def test_pieces_for_accepted() -> None:
    from decimal import Decimal

    from app.schemas import pieces_for_accepted

    lot = Decimal("300")
    assert pieces_for_accepted(lot, 4, Decimal("150")) == 2
    assert pieces_for_accepted(lot, 4, Decimal("2")) == 1  # min 1
    assert pieces_for_accepted(lot, 4, Decimal("300")) == 4  # max expected
    assert pieces_for_accepted(lot, 4, Decimal("0")) == 0
    assert pieces_for_accepted(Decimal("3"), 4, Decimal("2")) == 2  # lot below piece count


# --- PATCH /sap-outwards/by-ref/{ref} (Box UID scanned on SAP Outward) ----
BY_REF_URL = f"{PREFIX}/sap-outwards/by-ref/SAP-3"


def _by_ref_client(
    monkeypatch,
    *,
    canonical_box: str | None,
    assigned_to: str | None = None,
    line: str | None = "row",
):
    """TestClient for the by-ref patch with the DB and the Status service stubbed.

    The endpoint issues three `scalar` queries in a fixed order: the outward line
    for the reference, the canonical Box UID from the Boxes master (None = not
    registered / inactive), then the line that already holds that box (None =
    free). A Models-master lookup is answered on its own, off that order, since
    it only happens when the patch creates the line from its SAP identifiers.
    Returns the client, the line it patches and the reported events.
    """
    import uuid
    from datetime import datetime, timezone
    from decimal import Decimal

    from fastapi.testclient import TestClient

    from app import status_client
    from app.db import get_session
    from app.security import Principal, current_principal

    now = datetime(2026, 9, 20, tzinfo=timezone.utc)
    row = SapOutward(
        id=uuid.UUID(int=3), sap_reference_id="SAP-3", sap_document_no="GI-3",
        transaction_date=now, dc_no="DC-3", po_no="PO-3", material_no="M-3",
        model_no="90148", vendor_code=None, batch_no="B-3", lot_no="LOT-3",
        quantity=Decimal("300"), movement_type="313", source_system="SAP-ECC",
        box_uid=None, tray_id=None, tray_type=None, no_of_trays=None,
        front_case_trays=None, back_case_trays=None, outward_status="NEW",
        model_id=None, vendor_id=None, plating_color_id=None, location_id=None,
        status="active", created_at=now, updated_at=now, received_pieces=0,
        received_qty=None, inward_status=None, inward_last_scan_at=None, inward_scans=[],
    )
    answers = [row if line else None, canonical_box, assigned_to]
    reported: list[dict] = []

    class FakeSession:
        """`add` + `flush` stand in for the database: a real flush is what fills
        in the primary key and the column defaults a new row relies on."""

        added: list = []

        async def scalar(self, stmt):
            # Master lookups are answered off the fixed order below: they only
            # happen when the patch creates the line from its SAP identifiers.
            text = str(stmt)
            if "master_models" in text:
                return uuid.UUID(int=9)  # every model these tests use is registered
            if "vendors" in text:
                return uuid.UUID(int=10)  # ...and every vendor
            return answers.pop(0) if answers else None

        def add(self, obj):
            self.added.append(obj)

        async def flush(self):
            for obj in self.added:
                obj.id = obj.id or uuid.uuid4()
                obj.status = obj.status or "active"
                obj.source_system = obj.source_system or "SAP-ECC"
                obj.received_pieces = obj.received_pieces or 0
                obj.inward_scans = obj.inward_scans or []
                obj.created_at = obj.created_at or now
                obj.updated_at = obj.updated_at or now

    async def fake_session():
        yield FakeSession()

    async def fake_report(events):
        reported.extend(events)
        return []

    monkeypatch.setattr(status_client, "report", fake_report)
    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[current_principal] = lambda: Principal(subject="dev", role=None)
    return TestClient(app), row, reported


def test_box_uid_not_in_the_boxes_master_is_409(monkeypatch) -> None:
    client, row, reported = _by_ref_client(monkeypatch, canonical_box=None)
    try:
        resp = client.patch(BY_REF_URL, json={"box_uid": "NOPE-1"})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 409, resp.text
    assert "not registered in the Boxes master" in resp.json()["error"]["message"]
    # Nothing was persisted and the line was not dispatched.
    assert row.box_uid is None and row.outward_status == "NEW"
    assert reported == []


def test_box_uid_already_on_another_line_is_409(monkeypatch) -> None:
    client, row, reported = _by_ref_client(
        monkeypatch, canonical_box="BUID-0007", assigned_to="SAP-9"
    )
    try:
        resp = client.patch(BY_REF_URL, json={"box_uid": "buid-0007"})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 409, resp.text
    assert "already assigned to outward line SAP-9" in resp.json()["error"]["message"]
    assert row.box_uid is None and reported == []


def test_valid_box_uid_dispatches_the_line_and_reports_it(monkeypatch) -> None:
    client, row, reported = _by_ref_client(monkeypatch, canonical_box="BUID-0007")
    try:
        # Typed in lower case — the Boxes master's canonical spelling is stored.
        resp = client.patch(BY_REF_URL, json={"box_uid": "buid-0007"})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["box_uid"] == "BUID-0007"
    assert body["outward_status"] == "DISPATCHED"
    assert row.box_uid == "BUID-0007" and row.outward_status == "DISPATCHED"
    assert [(e["stage"], e["code"]) for e in reported] == [("outward", "DISPATCHED")]


def test_unknown_reference_without_the_sap_fields_is_404(monkeypatch) -> None:
    """No line yet and no SAP identifiers to build one from — nothing to patch."""
    client, _row, reported = _by_ref_client(
        monkeypatch, canonical_box="BUID-0007", line=None
    )
    try:
        resp = client.patch(f"{PREFIX}/sap-outwards/by-ref/UNKNOWN", json={"box_uid": "X"})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 404, resp.text
    assert reported == []


def test_unknown_reference_with_the_sap_fields_creates_the_line(monkeypatch) -> None:
    """The SAP feed lives in another service: a reference it knows but masterdata
    has no line for is created from the identifiers sent with the Box UID."""
    client, _row, reported = _by_ref_client(
        monkeypatch, canonical_box="BUID-0007", line=None
    )
    try:
        resp = client.patch(
            f"{PREFIX}/sap-outwards/by-ref/SAP-NEW",
            json={
                "box_uid": "BUID-0007",
                "transaction_date": "2026-09-20T00:00:00Z",
                "dc_no": "DC-9",
                "po_no": "PO-9",
                "model_no": "90148",
                "quantity": 300,
            },
        )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["sap_reference_id"] == "SAP-NEW"
    assert (body["dc_no"], body["po_no"], body["quantity"]) == ("DC-9", "PO-9", 300)
    assert body["box_uid"] == "BUID-0007" and body["outward_status"] == "DISPATCHED"
    assert [(e["stage"], e["code"]) for e in reported] == [("outward", "DISPATCHED")]


# --- GET /sap-inward/lines: the Main / Complete split --------------------
def test_inward_lines_stage_param_is_declared() -> None:
    params = app.openapi()["paths"][f"{PREFIX}/sap-inward/lines"]["get"]["parameters"]
    stage = next(p for p in params if p["name"] == "stage")
    assert stage["required"] is False  # omitting it keeps the original behaviour
    assert "pending" in str(stage["schema"]) and "received" in str(stage["schema"])
    # The description now describes the rack-placement meaning, not receiving.
    assert "rack" in stage["description"].lower()


def _inward_lines_sql(
    monkeypatch, *, placed=(), started_refs=(), status_down=False, **query
) -> str:
    """Run GET /sap-inward/lines against a stubbed session and Status service,
    and return the SQL of the statement it built.

    ``placed`` is what the Status service answers for ``rack``/``PLACED``;
    ``status_down`` makes that call fail instead, to exercise the fallback.
    ``started_refs`` is the answer for the placement-started codes
    (``started=true``).
    """
    from fastapi.testclient import TestClient

    from app import status_client
    from app.db import get_session
    from app.security import Principal, current_principal

    seen: list[str] = []
    asked: list[tuple[str, str]] = []

    async def fake_refs_in(stage: str, code: str) -> list[str]:
        asked.append((stage, code))
        if status_down:
            raise status_client.StatusServiceError("down")
        return list(placed) if code == "PLACED" else list(started_refs)

    monkeypatch.setattr(status_client, "refs_in", fake_refs_in)

    class FakeSession:
        async def scalar(self, stmt):
            seen.append(str(stmt))
            return 0

        async def scalars(self, stmt):
            seen.append(str(stmt))

            class _Empty:
                def all(self):
                    return []

            return _Empty()

    async def fake_session():
        yield FakeSession()

    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[current_principal] = lambda: Principal(subject="dev", role=None)
    try:
        client = TestClient(app)
        resp = client.get(f"{PREFIX}/sap-inward/lines", params=query)
        assert resp.status_code == 200, resp.text
    finally:
        app.dependency_overrides.clear()
    assert asked[0] == ("rack", "PLACED"), asked
    if not query.get("started"):
        assert asked == [("rack", "PLACED")], asked
    return " ".join(seen)


def test_inward_lines_pending_is_dispatched_but_not_placed(monkeypatch) -> None:
    """The Main Table holds every dispatched line that is not yet in a rack —
    including one receiving has already been recorded against."""
    sql = _inward_lines_sql(monkeypatch, stage="pending", placed=["SAP-1"])
    assert "sap_outwards.box_uid IS NOT NULL" in sql
    assert "sap_outwards.outward_status = :outward_status_1" in sql
    # Placement, not receiving, is what takes a line out of this half.
    assert "sap_outwards.sap_reference_id NOT IN" in sql
    assert "NOT (masterdata.sap_outwards.received_pieces >" not in sql
    # Most recently touched first, then the SAP date.
    assert (
        "ORDER BY masterdata.sap_outwards.inward_last_scan_at DESC NULLS LAST, "
        "masterdata.sap_outwards.transaction_date DESC"
    ) in sql


def test_inward_lines_received_is_the_placed_set(monkeypatch) -> None:
    """The Complete Table is exactly the rack/PLACED references; no stage means
    the same thing."""
    received = _inward_lines_sql(monkeypatch, stage="received", placed=["SAP-1"])
    assert "sap_outwards.sap_reference_id IN" in received
    assert "sap_outwards.box_uid IS NOT NULL" not in received
    assert "ORDER BY masterdata.sap_outwards.inward_last_scan_at DESC NULLS LAST" in received
    default = _inward_lines_sql(monkeypatch, placed=["SAP-1"])
    assert default == received


def test_inward_lines_partially_placed_line_stays_in_pending(monkeypatch) -> None:
    """A PARTIALLY_PLACED line is not in the rack/PLACED set, so nothing puts it
    in the Complete Table — with nothing placed at all, that half is empty."""
    pending = _inward_lines_sql(monkeypatch, stage="pending", placed=[])
    assert "sap_outwards.box_uid IS NOT NULL" in pending
    received = _inward_lines_sql(monkeypatch, stage="received", placed=[])
    # An empty placed set selects nothing rather than everything.
    assert "WHERE false" in received.lower() or "false" in received.lower()


def test_inward_lines_survives_a_status_service_outage(monkeypatch) -> None:
    """:8004 down must not 500 the worklist — it falls back to the old split."""
    sql = _inward_lines_sql(monkeypatch, stage="pending", status_down=True)
    assert "NOT (masterdata.sap_outwards.received_pieces >" in sql
    assert "sap_outwards.sap_reference_id IN" not in sql
    default = _inward_lines_sql(monkeypatch, status_down=True)
    assert "sap_outwards.received_pieces >" in default


def test_inward_lines_started_narrows_pending_to_placement_in_progress(monkeypatch) -> None:
    """``started=true`` is SAP Inward's "work already started" group: pending
    lines whose rack placement is under way, asked of the Status service."""
    sql = _inward_lines_sql(
        monkeypatch, stage="pending", started="true", placed=["SAP-1"], started_refs=["SAP-2"]
    )
    # still the pending half...
    assert "sap_outwards.box_uid IS NOT NULL" in sql
    assert "sap_outwards.sap_reference_id NOT IN" in sql
    # ...narrowed to the started set
    assert "sap_outwards.sap_reference_id IN" in sql
    # Without the flag the pending list is exactly what it was.
    plain = _inward_lines_sql(monkeypatch, stage="pending", placed=["SAP-1"])
    assert "sap_outwards.sap_reference_id IN (" not in plain.replace("NOT IN (", "")


def test_inward_lines_started_covers_every_in_progress_code(monkeypatch) -> None:
    from app.api import _RACK_STARTED

    assert set(_RACK_STARTED) == {"IN_PROGRESS", "DRAFT", "PARTIALLY_PLACED"}
    sql = _inward_lines_sql(monkeypatch, stage="pending", started="true", started_refs=[])
    # Nothing started → nothing listed, never everything.
    assert "false" in sql.lower()


def test_inward_lines_started_is_empty_when_status_is_down(monkeypatch) -> None:
    sql = _inward_lines_sql(monkeypatch, stage="pending", started="true", status_down=True)
    assert "false" in sql.lower()


# --- shortage back-orders: the parent's figures are snapshotted -----------
def test_shortage_snapshot_columns_exist_on_the_model_and_schema() -> None:
    """A back-order carries the parent's trail (revision 0024), so the hover can
    account for its own qty without fetching the parent."""
    columns = {
        "shortage_parent_lot_qty",
        "shortage_parent_accepted_qty",
        "shortage_parent_rejected_qty",
        "shortage_parent_received_qty",
    }
    assert columns <= set(SapOutward.__table__.columns.keys())
    for name in columns:
        assert SapOutward.__table__.columns[name].nullable is True, name
    assert columns <= set(SapOutwardOut.model_fields)
    # ...and they reach the wire as plain numbers, like every other quantity.
    props = app.openapi()["components"]["schemas"]["SapOutwardOut"]["properties"]
    assert columns <= set(props)


def test_backorder_snapshots_the_parents_figures() -> None:
    """``_raise_shortage_backorder`` freezes lot / accepted / rejected / received
    onto the new line."""
    import asyncio
    from decimal import Decimal

    from app import api

    parent = SapOutward(
        sap_reference_id="SAP-260920-037",
        quantity=Decimal("300"),
        received_qty=Decimal("60"),
    )

    class FakeSession:
        def add(self, _obj):
            pass

        async def flush(self):
            pass

        async def scalar(self, _stmt):
            return None

    made = asyncio.run(
        api._raise_shortage_backorder(
            parent,
            Decimal("240"),
            FakeSession(),
            accepted=Decimal("60"),
            rejected=Decimal("0"),
        )
    )
    assert made.quantity == Decimal("240")
    assert made.parent_sap_reference_id == "SAP-260920-037"
    assert made.shortage_parent_lot_qty == Decimal("300")
    assert made.shortage_parent_accepted_qty == Decimal("60")
    assert made.shortage_parent_rejected_qty == Decimal("0")
    assert made.shortage_parent_received_qty == Decimal("60")


# --- placeholder identifiers never reach the grid ------------------------
#
# A QA run once left lines reading ``DC-VERIFY / PO-VERIFY / M-VERIFY`` with an
# empty Vendor, Batch and SAP column on SAP Outward's Main Table. Being Pending
# must change the status cell and nothing else, and no write path may store a
# model the Models master does not know. Fixture values are deliberately
# unmistakable for production data, and nothing here opens a connection.

#: The one model the fake Models master below recognises.
KNOWN_MODEL = "90148"


class _FakeModelMaster:
    """Stands in for the session ``_validate_master_refs`` queries: answers a
    lookup with an id only for :data:`KNOWN_MODEL`."""

    def __init__(self) -> None:
        self.model_id = __import__("uuid").UUID(int=7)

    async def scalar(self, stmt):
        compiled = str(stmt).lower()
        if "master_models" not in compiled:
            return None
        text = str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()
        return self.model_id if f"'{KNOWN_MODEL.lower()}'" in text else None


def test_pending_backorder_keeps_the_parents_real_identifiers() -> None:
    """A shortage back-order is Pending, but it is not anonymous: every SAP
    identifier comes straight off the parent, so the Main Table shows the same
    model / vendor / batch / movement type the dispatched line showed."""
    import asyncio
    from decimal import Decimal

    from app import api

    parent = SapOutward(
        sap_reference_id="SAP-260920-037",
        quantity=Decimal("300"),
        received_qty=Decimal("60"),
        dc_no="DC-260920-27",
        po_no="PO-4500004119",
        material_no="MAT-771706",
        model_no=KNOWN_MODEL,
        vendor_code="VEN-TEST",
        batch_no="B260963",
        lot_no="LOT-TEST",
        movement_type="101",
        source_system="SAP-ECC",
    )

    class FakeSession:
        def add(self, _obj):
            pass

        async def flush(self):
            pass

        async def scalar(self, _stmt):
            return None

    made = asyncio.run(
        api._raise_shortage_backorder(
            parent,
            Decimal("240"),
            FakeSession(),
            accepted=Decimal("60"),
            rejected=Decimal("0"),
        )
    )
    # Only the status, the quantity and the receiving fields differ.
    assert made.outward_status == "PENDING"
    assert made.quantity == Decimal("240")
    assert made.box_uid is None
    # Everything a grid column reads is the parent's, verbatim.
    assert made.model_no == KNOWN_MODEL
    assert made.vendor_code == "VEN-TEST"
    assert made.batch_no == "B260963"
    assert made.movement_type == "101"
    assert made.dc_no == "DC-260920-27"
    assert made.po_no == "PO-4500004119"
    assert made.material_no == "MAT-771706"
    # ...and nothing was invented in its place.
    for field in ("model_no", "vendor_code", "batch_no", "movement_type"):
        assert not str(getattr(made, field)).endswith("-VERIFY"), field


def test_known_model_no_resolves_to_its_master_row() -> None:
    """A model the master knows passes and backfills ``model_id``."""
    import asyncio

    from app import api

    session = _FakeModelMaster()
    data = {"model_no": KNOWN_MODEL}
    asyncio.run(api._validate_master_refs(session, data))
    assert data["model_id"] == session.model_id


def test_unknown_model_no_is_rejected() -> None:
    """An unregistered model is refused with the service's conflict error rather
    than stored — this is what would have stopped ``M-VERIFY`` at the door."""
    import asyncio

    import pytest

    from app import api
    from app.errors import ConflictError

    for unknown in ("M-VERIFY", "M-1", "NOT-A-MODEL"):
        with pytest.raises(ConflictError) as raised:
            asyncio.run(api._validate_master_refs(_FakeModelMaster(), {"model_no": unknown}))
        assert unknown in raised.value.message
        assert "Models master" in raised.value.message


def test_clearing_model_no_clears_its_id() -> None:
    """Explicitly blanking the model blanks the resolved id with it, the way
    ``vendor_code`` already behaves."""
    import asyncio

    from app import api

    data: dict = {"model_no": None}
    asyncio.run(api._validate_master_refs(_FakeModelMaster(), data))
    assert data["model_id"] is None


# --- the vendor reaches the outward line ---------------------------------
#
# SAP Inward and the receipts read masterdata, not the feed, so a line that does
# not name its own vendor shows an empty Vendor column there. The vendor is a
# SAP identifier and seeds a new line with the rest of them.


def test_vendor_code_is_a_seed_field() -> None:
    """It creates a line, it does not edit one — the grid never offered it as an
    editable column, and an existing line is not rewritten from the client."""
    from app.schemas import SAP_OUTWARD_SEED_FIELDS, SapOutwardTxnPatch

    assert "vendor_code" in SAP_OUTWARD_SEED_FIELDS
    # still accepted on the wire, or the seed could never carry it
    assert "vendor_code" in SapOutwardTxnPatch.model_fields


def test_unknown_reference_creates_the_line_with_its_vendor(monkeypatch) -> None:
    """A line created from a SAP reference carries the vendor across, and the
    Vendors master resolves it to a vendor_id on the way in."""
    client, _row, _reported = _by_ref_client(
        monkeypatch, canonical_box="BUID-0007", line=None
    )
    try:
        resp = client.patch(
            f"{PREFIX}/sap-outwards/by-ref/SAP-NEW-VENDOR",
            json={
                "box_uid": "BUID-0007",
                "transaction_date": "2026-09-20T00:00:00Z",
                "dc_no": "DC-9",
                "po_no": "PO-9",
                "model_no": "90148",
                "vendor_code": "VEN-TEST",
                "quantity": 300,
            },
        )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["vendor_code"] == "VEN-TEST"
    assert body["vendor_id"] is not None, "the Vendors master lookup was not applied"
