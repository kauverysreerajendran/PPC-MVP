"""Contract / wiring tests that need no database."""

from __future__ import annotations

import os

# Import-time only: Settings requires a DSN. Not a real credential, never connected.
os.environ.setdefault(
    "RACK_DATABASE_URL",
    "postgresql+asyncpg://test:test@localhost:5432/rack_test",
)

from app.crud import CrudRepository  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Rack  # noqa: E402
from app.schemas import RackCreate, RackOut  # noqa: E402

PREFIX = "/api/v1/rack"


def _paths() -> set[str]:
    return set(app.openapi()["paths"].keys())


def test_rest_surface() -> None:
    paths = _paths()
    assert f"{PREFIX}/slots" in paths
    assert f"{PREFIX}/slots/{{obj_id}}" in paths
    assert f"{PREFIX}/slots/{{obj_id}}/occupy" in paths
    assert f"{PREFIX}/slots/{{obj_id}}/release" in paths
    assert set(app.openapi()["paths"][f"{PREFIX}/slots"]) == {"get", "post"}
    assert set(app.openapi()["paths"][f"{PREFIX}/slots/{{obj_id}}"]) == {
        "get",
        "put",
        "delete",
    }


def test_health_endpoint_registered() -> None:
    assert f"{PREFIX}/health" in _paths()


def test_out_schema_matches_model_columns() -> None:
    cols = {c.name for c in Rack.__table__.columns}
    for field in RackOut.model_fields:
        assert field in cols, f"RackOut.{field} not a column of Rack"


def test_occupied_requires_model_no() -> None:
    import pytest

    with pytest.raises(ValueError):
        RackCreate(rack_code="K", row_no=1, column_no=1, shelf_no=1, occupied=True)


def test_crud_repo_defaults() -> None:
    repo = CrudRepository(
        Rack,
        searchable=(Rack.rack_code,),
        sortable={"rack_code": Rack.rack_code},
        default_sort="rack_code",
    )
    assert repo.unique_fields == ()
    assert repo.default_sort == "rack_code"
