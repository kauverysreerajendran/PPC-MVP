"""Contract / wiring tests that need no database."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

# Import-time only: Settings requires a DSN. Not a real credential, never connected.
os.environ.setdefault(
    "STATUS_DATABASE_URL",
    "postgresql+asyncpg://test:test@localhost:5432/status_test",
)

from app import models as m
from app.main import app
from app.schemas import EventIn

PREFIX = "/api/v1/status"


def _paths() -> set[str]:
    return set(app.openapi()["paths"].keys())


def test_rest_surface() -> None:
    paths = _paths()
    for path in (
        f"{PREFIX}/health",
        f"{PREFIX}/definitions",
        f"{PREFIX}/events",
        f"{PREFIX}/events/batch",
        f"{PREFIX}/lines",
        f"{PREFIX}/lines/by-ref/{{sap_reference_id}}",
        f"{PREFIX}/refs",
    ):
        assert path in paths, path


def test_tables_live_in_status_schema() -> None:
    for model in (m.StatusDefinition, m.LineStatus, m.StatusEvent):
        assert model.__table__.schema == "status"


def _seeded_definitions() -> list[tuple]:
    """Every status the migrations seed — 0001 plus each later revision that
    adds one (they all expose the same ``DEFINITIONS`` tuple shape)."""
    versions = Path(__file__).resolve().parents[1] / "alembic" / "versions"
    defs: list[tuple] = []
    for path in sorted(versions.glob("0*.py")):
        spec = importlib.util.spec_from_file_location(f"status_{path.stem}", path)
        module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        spec.loader.exec_module(module)  # type: ignore[union-attr]
        defs.extend(getattr(module, "DEFINITIONS", []))
    return defs


def test_seed_covers_every_stage_with_one_initial_status() -> None:
    defs = _seeded_definitions()
    for stage in m.STAGES:
        initial = [d for d in defs if d[0] == stage and d[5]]
        assert len(initial) == 1, stage
    # the codes the other services report must exist in the master
    codes = {(d[0], d[1]) for d in defs}
    for needed in (
        ("outward", "DISPATCHED"),
        ("outward", "RECEIVED"),
        # a shortage back-order raised by SAP Inward, still to be dispatched
        ("outward", "PENDING"),
        ("inward", "NOT_RECEIVED"),
        ("inward", "YET_TO_VERIFY"),
        ("inward", "VERIFIED"),
        ("rack", "PARTIALLY_PLACED"),
        ("rack", "PLACED"),
    ):
        assert needed in codes, needed


def test_event_rejects_unknown_stage() -> None:
    try:
        EventIn(sap_reference_id="SAP-1", stage="packing", code="X")  # type: ignore[arg-type]
    except ValueError:
        return
    raise AssertionError("unknown stage accepted")


def test_refs_matches_any_of_several_comma_separated_codes() -> None:
    """SAP Outward's Complete Table asks for `DISPATCHED,RECEIVED` in one call:
    a line is complete once dispatched, and stays so after it is received."""
    from fastapi.testclient import TestClient

    from app.db import get_session
    from app.security import Principal, current_principal

    seen: list[str] = []

    class FakeSession:
        async def scalars(self, stmt):
            seen.append(str(stmt))

            class _Rows:
                def all(self):
                    return ["SAP-1", "SAP-2"]

            return _Rows()

    async def fake_session():
        yield FakeSession()

    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[current_principal] = lambda: Principal(subject="dev", role=None)
    try:
        client = TestClient(app)
        many = client.get(
            f"{PREFIX}/refs", params={"stage": "outward", "code": "DISPATCHED,RECEIVED"}
        )
        one = client.get(f"{PREFIX}/refs", params={"stage": "outward", "code": "RECEIVED"})
    finally:
        app.dependency_overrides.clear()

    assert many.status_code == 200, many.text
    assert many.json() == {
        "stage": "outward",
        "code": "DISPATCHED,RECEIVED",
        "count": 2,
        "refs": ["SAP-1", "SAP-2"],
    }
    # Both forms use the same IN predicate — one code behaves exactly as before.
    assert "line_status.code IN" in seen[0]
    assert one.status_code == 200, one.text
    assert "line_status.code IN" in seen[1]
