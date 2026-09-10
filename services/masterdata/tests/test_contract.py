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
