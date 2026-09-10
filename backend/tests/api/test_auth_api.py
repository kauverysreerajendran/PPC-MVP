import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

pytestmark = [pytest.mark.api, pytest.mark.asyncio]


@pytest_asyncio.fixture()
async def client(db, monkeypatch):
    # Route the app's DB dependency at the test session.
    from app.db import session as sess
    from app.main import create_app

    async def _override():
        yield db

    monkeypatch.setattr(
        "app.services.auth.service.send_welcome_email",
        type("T", (), {"delay": staticmethod(lambda *_: None)}),
    )
    app = create_app()
    app.dependency_overrides[sess.get_db] = _override
    app.dependency_overrides[sess.get_db_ro] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_register_login_me_flow(client):
    r = await client.post(
        "/api/v1/auth/register", json={"email": "bob@acme.test", "password": "Password123"}
    )
    assert r.status_code == 201

    r = await client.post(
        "/api/v1/auth/login", json={"email": "bob@acme.test", "password": "Password123"}
    )
    assert r.status_code == 200
    token = r.json()["access_token"]
    assert "refresh_token" in r.cookies

    r = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "bob@acme.test"


async def test_protected_route_requires_token(client):
    r = await client.get("/api/v1/projects")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_credentials"


async def test_healthz_ok(client):
    assert (await client.get("/healthz")).status_code == 200
