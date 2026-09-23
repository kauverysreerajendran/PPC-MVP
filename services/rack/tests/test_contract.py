"""Contract / wiring tests that need no database."""

from __future__ import annotations

import os

# Import-time only: Settings requires a DSN. Not a real credential, never connected.
os.environ.setdefault(
    "RACK_DATABASE_URL",
    "postgresql+asyncpg://test:test@localhost:5432/rack_test",
)

from app import topology as t  # noqa: E402
from app.crud import CrudRepository  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Rack, RackMaster, location_code  # noqa: E402
from app.schemas import Occupancy, RackCreate, RackMasterCreate, RackOut  # noqa: E402

PREFIX = "/api/v1/rack"


def _paths() -> set[str]:
    return set(app.openapi()["paths"].keys())


def test_rest_surface() -> None:
    paths = _paths()
    assert f"{PREFIX}/slots" in paths
    assert f"{PREFIX}/slots/{{obj_id}}" in paths
    assert f"{PREFIX}/slots/{{obj_id}}/occupy" in paths
    assert f"{PREFIX}/slots/{{obj_id}}/release" in paths
    assert f"{PREFIX}/slots/{{obj_id}}/state" in paths
    assert set(app.openapi()["paths"][f"{PREFIX}/slots"]) == {"get", "post"}
    assert set(app.openapi()["paths"][f"{PREFIX}/slots/{{obj_id}}"]) == {
        "get",
        "put",
        "delete",
    }


def test_rack_locator_surface() -> None:
    paths = _paths()
    for path in (
        f"{PREFIX}/masters",
        f"{PREFIX}/masters/{{obj_id}}",
        f"{PREFIX}/masters/{{obj_id}}/materialize",
        f"{PREFIX}/masters/materialize",
        f"{PREFIX}/topology",
        f"{PREFIX}/racks/{{rack_code}}",
        f"{PREFIX}/locate",
        f"{PREFIX}/resolve",
        f"{PREFIX}/find",
        f"{PREFIX}/allocate",
    ):
        assert path in paths, f"{path} missing from the published API"


def test_allocation_helpers() -> None:
    import random
    from decimal import Decimal

    from app import allocation as a

    # a lot quantity always splits back to itself
    parts = a._split_qty(Decimal("231"), 20)
    assert len(parts) == 20
    assert sum(parts) == Decimal("231.000")
    parts = a._split_qty(Decimal("27"), 4)
    assert sum(parts) == Decimal("27.000")
    assert a._split_qty(None, 3) == [None, None, None]

    # front-case trays come from front rows, back-case from back rows
    class _Slot:
        def __init__(self, row_no: int) -> None:
            self.row_no = row_no

    wh = a._Warehouse(random.Random(1))
    for _ in range(10):
        wh.add(_Slot(1), row_count=4)  # front
        wh.add(_Slot(4), row_count=4)  # back
    picked = wh.take(want_front=3, want_back=2, want_any=0)
    assert sum(1 for s in picked if s.row_no == 1) == 3
    assert sum(1 for s in picked if s.row_no == 4) == 2


def test_health_endpoint_registered() -> None:
    assert f"{PREFIX}/health" in _paths()


def test_out_schema_matches_model_columns() -> None:
    cols = {c.name for c in Rack.__table__.columns}
    derived = {"code"}  # computed on the model, not stored
    for field in RackOut.model_fields:
        assert field in cols or field in derived, f"RackOut.{field} is not on Rack"


def test_occupied_requires_model_no() -> None:
    import pytest

    with pytest.raises(ValueError):
        RackCreate(
            warehouse_code="CBFC",
            aisle_code="R",
            rack_code="K",
            shelf_no=1,
            row_no=1,
            tray_no=1,
            occupied=True,
        )


def test_location_code_is_zero_padded() -> None:
    assert location_code("K", 4, 2, 5) == "K-S4-R2-T05"
    assert location_code("A1", 1, 1, 12) == "A1-S1-R1-T12"


def test_parse_code_accepts_the_shapes_a_scanner_produces() -> None:
    assert t.parse_code("K-S4-R2-T05") == ("K", 4, 2, 5)
    assert t.parse_code("k s4 r2 t5") == ("K", 4, 2, 5)
    assert t.parse_code("A1/S1/R1/T12") == ("A1", 1, 1, 12)
    assert t.parse_code("90148") is None  # a model_no, not a location


def test_capacity_comes_from_the_master_shape() -> None:
    master = RackMaster(
        warehouse_code="CBFC",
        aisle_code="R",
        rack_code="K",
        shelf_count=6,
        row_count=4,
        tray_count=15,
    )
    assert master.capacity == 360


def test_occupancy_derives_empty_from_capacity() -> None:
    occ = t._occupancy(360, occupied=312, reserved=6, blocked=2)
    assert occ.empty == 40
    assert occ.occupancy_pct == 86.7
    assert occ.availability_pct == 11.1


def test_rack_state_thresholds() -> None:
    assert t._rack_state(t._occupancy(100, occupied=0)) == "empty"
    assert t._rack_state(t._occupancy(100, occupied=10)) == "available"
    assert t._rack_state(t._occupancy(100, occupied=60)) == "filling"
    assert t._rack_state(t._occupancy(100, occupied=90)) == "nearly_full"
    assert t._rack_state(t._occupancy(100, occupied=100)) == "full"


def test_score_prefers_the_near_low_reachable_slot() -> None:
    master = RackMaster(
        warehouse_code="CBFC",
        aisle_code="R",
        rack_code="K",
        position=1,
        shelf_count=6,
        row_count=4,
        tray_count=15,
    )

    def slot(shelf: int, row: int, tray: int) -> Rack:
        return Rack(
            warehouse_code="CBFC",
            aisle_code="R",
            rack_code="K",
            shelf_no=shelf,
            row_no=row,
            tray_no=tray,
        )

    best, _ = t._score(master, slot(2, 1, 1))  # waist height, front, nearest
    overhead, _ = t._score(master, slot(6, 1, 1))
    deep, _ = t._score(master, slot(2, 4, 1))
    far, _ = t._score(master, slot(2, 1, 15))
    assert best < overhead
    assert best < deep
    assert best < far


def test_master_create_rejects_an_impossible_shape() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        RackMasterCreate(
            warehouse_code="CBFC",
            aisle_code="R",
            rack_code="K",
            shelf_count=0,
            row_count=4,
            tray_count=15,
        )


def test_occupancy_of_an_empty_rack_is_all_zero_percent() -> None:
    assert t._sum([]) == Occupancy()


def test_crud_repo_defaults() -> None:
    repo = CrudRepository(
        Rack,
        searchable=(Rack.rack_code,),
        sortable={"rack_code": Rack.rack_code},
        default_sort="rack_code",
    )
    assert repo.unique_fields == ()
    assert repo.default_sort == "rack_code"


def test_place_received_pieces_marks_the_line_placed(monkeypatch) -> None:
    """Two pieces derived from an accepted qty go into two trays → Placed."""
    import uuid
    from datetime import datetime, timezone

    from fastapi.testclient import TestClient

    from app import api
    from app.db import get_session
    from app.security import Principal, current_principal

    now = datetime(2026, 9, 14, tzinfo=timezone.utc)
    slots = {
        uuid.UUID(int=n): Rack(
            id=uuid.UUID(int=n), warehouse_code="CBFC", aisle_code="A1", rack_code="K",
            shelf_no=1, row_no=1, tray_no=n, location_name=None, slot_state="empty",
            occupied=False, occupied_by_model=None, date_of_occupied=None, qty=None,
            lot_no=None, sap_reference_id=None, placement_source=None, notes=None,
            status="active", created_at=now, updated_at=now,
        )
        for n in (1, 2)
    }
    reported: list[dict] = []

    class FakeSession:
        async def scalar(self, _stmt):
            return 0  # nothing placed yet

        async def get(self, _model, obj_id, with_for_update=False):
            return slots.get(obj_id)

        async def flush(self):
            return None

    async def fake_session():
        yield FakeSession()

    async def known(_model_no):
        return True

    async def fake_report(events):
        reported.extend(events)
        return []

    monkeypatch.setattr(api, "model_exists", known)
    monkeypatch.setattr(api, "report_status", fake_report)
    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[current_principal] = lambda: Principal(subject="dev", role=None)
    try:
        resp = TestClient(app).post(
            f"{PREFIX}/place",
            json={
                "sap_reference_id": "SAP-2",
                "model_no": "90148",
                "lot_no": "LOT-2",
                "received_pieces": 2,
                "pieces": [{"slot_id": str(sid), "qty": 75} for sid in slots],
            },
        )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["rack_status"], body["placed_now"], body["placed_total"]) == ("PLACED", 2, 2)
    assert all(slot.occupied and slot.qty == 75 for slot in slots.values())
    assert reported[0]["code"] == "PLACED"
    assert reported[0]["note"] == "2 of 2 received pieces in racks"


def _place_harness(monkeypatch, tray_count: int, already: int = 0):
    """A TestClient over `POST /place` with `tray_count` free trays in memory."""
    import uuid
    from datetime import datetime, timezone

    from fastapi.testclient import TestClient

    from app import api
    from app.db import get_session
    from app.security import Principal, current_principal

    now = datetime(2026, 9, 21, tzinfo=timezone.utc)
    slots = {
        uuid.UUID(int=n): Rack(
            id=uuid.UUID(int=n), warehouse_code="CBFC", aisle_code="A1", rack_code="K",
            shelf_no=1, row_no=1, tray_no=n, location_name=None, slot_state="empty",
            occupied=False, occupied_by_model=None, date_of_occupied=None, qty=None,
            pieces=None, lot_no=None, sap_reference_id=None, placement_source=None,
            notes=None, status="active", created_at=now, updated_at=now,
        )
        for n in range(1, tray_count + 1)
    }
    reported: list[dict] = []

    class FakeSession:
        async def scalar(self, _stmt):
            return already  # received pieces of this line already in racks

        async def get(self, _model, obj_id, with_for_update=False):
            return slots.get(obj_id)

        async def flush(self):
            return None

    async def fake_session():
        yield FakeSession()

    async def known(_model_no):
        return True

    async def fake_report(events):
        reported.extend(events)
        return []

    monkeypatch.setattr(api, "model_exists", known)
    monkeypatch.setattr(api, "report_status", fake_report)
    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[current_principal] = lambda: Principal(subject="dev", role=None)
    return TestClient(app), slots, reported


def _place(client, *, received_pieces: int, pieces: list[dict]):
    return client.post(
        f"{PREFIX}/place",
        json={
            "sap_reference_id": "SAP-40",
            "model_no": "90148",
            "lot_no": "LOT-40",
            "received_pieces": received_pieces,
            "pieces": pieces,
        },
    )


def test_tray_capacity_rules() -> None:
    from app.capacity import DEFAULT_TRAY_CAPACITY_PIECES, trays_needed

    assert DEFAULT_TRAY_CAPACITY_PIECES == 25
    assert trays_needed(40) == 2  # 25 + a partial 15
    assert trays_needed(25) == 1
    assert trays_needed(26) == 2
    assert trays_needed(0) == 0
    assert trays_needed(40, 20) == 2


def test_forty_pieces_in_two_trays_is_placed(monkeypatch) -> None:
    """25 + 15 across two trays fills the line — trays are not pieces."""
    client, slots, reported = _place_harness(monkeypatch, tray_count=2)
    ids = list(slots)
    try:
        resp = _place(
            client,
            received_pieces=40,
            pieces=[
                {"slot_id": str(ids[0]), "pieces": 25, "qty": 250},
                {"slot_id": str(ids[1]), "pieces": 15, "qty": 150},
            ],
        )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["rack_status"], body["placed_now"], body["placed_total"]) == ("PLACED", 40, 40)
    assert [s.pieces for s in slots.values()] == [25, 15]
    assert reported[0]["note"] == "40 of 40 received pieces in racks"


def test_one_full_tray_of_forty_leaves_fifteen(monkeypatch) -> None:
    client, slots, reported = _place_harness(monkeypatch, tray_count=2)
    ids = list(slots)
    try:
        resp = _place(client, received_pieces=40, pieces=[{"slot_id": str(ids[0]), "pieces": 25}])
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["rack_status"] == "PARTIALLY_PLACED"
    assert body["received_pieces"] - body["placed_total"] == 15
    assert reported[0]["code"] == "PARTIALLY_PLACED"


def test_a_tray_cannot_take_more_than_its_capacity(monkeypatch) -> None:
    client, slots, _ = _place_harness(monkeypatch, tray_count=1)
    ids = list(slots)
    try:
        resp = _place(client, received_pieces=40, pieces=[{"slot_id": str(ids[0]), "pieces": 26}])
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 409, resp.text
    assert "25" in resp.text
    assert slots[ids[0]].occupied is False


def test_legacy_one_piece_per_tray_call_is_unchanged(monkeypatch) -> None:
    """No `pieces` field: two trays, two pieces, Placed — exactly as before."""
    client, slots, reported = _place_harness(monkeypatch, tray_count=2)
    try:
        resp = _place(
            client,
            received_pieces=2,
            pieces=[{"slot_id": str(sid), "qty": 75} for sid in slots],
        )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["rack_status"], body["placed_now"], body["placed_total"]) == ("PLACED", 2, 2)
    assert all(slot.pieces == 1 and slot.qty == 75 for slot in slots.values())
    assert reported[0]["note"] == "2 of 2 received pieces in racks"


def _place_qty(client, *, received_qty: int, trays: list[tuple[object, int]]):
    """Place by quantity: the line has one front+back piece and 60 accepted qty."""
    return client.post(
        f"{PREFIX}/place",
        json={
            "sap_reference_id": "SAP-60",
            "model_no": "90140",
            "lot_no": "LOT-6051",
            "received_pieces": 1,
            "received_qty": received_qty,
            "pieces": [{"slot_id": str(sid), "qty": qty} for sid, qty in trays],
        },
    )


def test_sixty_qty_in_three_trays_is_placed(monkeypatch) -> None:
    """Capacity counts qty, not pieces: 60 -> 25 + 25 + 10 fills a 1-piece line."""
    client, slots, reported = _place_harness(monkeypatch, tray_count=3)
    ids = list(slots)
    try:
        resp = _place_qty(client, received_qty=60, trays=list(zip(ids, [25, 25, 10])))
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["rack_status"] == "PLACED"
    assert float(body["placed_qty_total"]) == 60
    assert [int(s.qty) for s in slots.values()] == [25, 25, 10]
    assert reported[0]["code"] == "PLACED"
    assert reported[0]["note"] == "60 of 60 received qty in racks"


def test_one_tray_of_sixty_qty_leaves_thirty_five(monkeypatch) -> None:
    client, slots, reported = _place_harness(monkeypatch, tray_count=3)
    ids = list(slots)
    try:
        resp = _place_qty(client, received_qty=60, trays=[(ids[0], 25)])
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["rack_status"] == "PARTIALLY_PLACED"
    assert float(body["received_qty"]) - float(body["placed_qty_total"]) == 35
    assert reported[0]["code"] == "PARTIALLY_PLACED"
    assert reported[0]["note"] == "25 of 60 received qty in racks"


def test_a_tray_cannot_take_more_than_its_capacity_in_qty(monkeypatch) -> None:
    client, slots, reported = _place_harness(monkeypatch, tray_count=3)
    ids = list(slots)
    try:
        resp = _place_qty(client, received_qty=60, trays=[(ids[0], 26), (ids[1], 25)])
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 409, resp.text
    assert "25" in resp.text
    assert reported == []


def test_qty_beyond_what_is_left_is_rejected(monkeypatch) -> None:
    client, slots, reported = _place_harness(monkeypatch, tray_count=3)
    ids = list(slots)
    try:
        resp = _place_qty(client, received_qty=60, trays=list(zip(ids, [25, 25, 25])))
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 409, resp.text
    assert "60 qty left" in resp.text
    assert not any(s.occupied for s in slots.values())


def test_232_qty_across_ten_trays_is_placed(monkeypatch) -> None:
    """A full lot: 9 x 25 + 7 fills the line in one confirm."""
    client, slots, reported = _place_harness(monkeypatch, tray_count=10)
    ids = list(slots)
    try:
        resp = _place_qty(client, received_qty=232, trays=list(zip(ids, [25] * 9 + [7])))
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["rack_status"] == "PLACED"
    assert float(body["placed_qty_total"]) == 232
    assert reported[0]["code"] == "PLACED"
    assert reported[0]["note"] == "232 of 232 received qty in racks"


def test_a_zero_qty_tray_rejects_the_batch(monkeypatch) -> None:
    """An extra tray with nothing to take is refused, and nothing is stored."""
    client, slots, reported = _place_harness(monkeypatch, tray_count=10)
    ids = list(slots)
    try:
        resp = _place_qty(client, received_qty=225, trays=list(zip(ids, [25] * 9 + [0])))
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 409, resp.text
    assert "every tray needs the quantity it takes" in resp.text
    assert not any(s.occupied for s in slots.values())
    assert reported == []


def test_remainder_after_seven_already_in_racks(monkeypatch) -> None:
    """7 qty already placed: 225 is what is left, and the message says so."""
    client, slots, reported = _place_harness(monkeypatch, tray_count=10, already=7)
    ids = list(slots)
    try:
        too_much = _place_qty(client, received_qty=232, trays=list(zip(ids, [25] * 9 + [7])))
        exact = _place_qty(client, received_qty=232, trays=list(zip(ids[:9], [25] * 9)))
    finally:
        app.dependency_overrides.clear()
    assert too_much.status_code == 409, too_much.text
    assert "225 qty left to place (7 already in racks, 232 asked for)" in too_much.text
    assert exact.status_code == 200, exact.text
    body = exact.json()
    assert body["rack_status"] == "PLACED"
    assert float(body["placed_qty_total"]) == 232
    assert reported[0]["note"] == "232 of 232 received qty in racks"
