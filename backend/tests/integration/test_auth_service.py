import pytest
from app.core.exceptions import AuthenticationError, ConflictError, TokenReuseError
from app.services.auth.service import AuthService

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


async def _register(db):
    svc = AuthService(db)
    user = await svc.register("alice@acme.test", "Password123", "Alice")
    await db.flush()
    return svc, user


async def test_register_then_login(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.auth.service.send_welcome_email",
        type("T", (), {"delay": staticmethod(lambda *_: None)}),
    )
    svc, _ = await _register(db)
    result = await svc.authenticate(
        "alice@acme.test", "Password123", ip="1.1.1.1", user_agent="pytest"
    )
    assert result.access.access_token
    assert result.refresh_token


async def test_duplicate_email_rejected(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.auth.service.send_welcome_email",
        type("T", (), {"delay": staticmethod(lambda *_: None)}),
    )
    await _register(db)
    with pytest.raises(ConflictError):
        await AuthService(db).register("alice@acme.test", "Password123", None)


async def test_bad_password_rejected(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.auth.service.send_welcome_email",
        type("T", (), {"delay": staticmethod(lambda *_: None)}),
    )
    svc, _ = await _register(db)
    with pytest.raises(AuthenticationError):
        await svc.authenticate("alice@acme.test", "nope", ip=None, user_agent=None)


async def test_refresh_rotation_and_reuse_detection(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.auth.service.send_welcome_email",
        type("T", (), {"delay": staticmethod(lambda *_: None)}),
    )
    svc, _ = await _register(db)
    first = await svc.authenticate("alice@acme.test", "Password123", ip=None, user_agent=None)
    rotated = await svc.refresh(first.refresh_token, ip=None, user_agent=None)
    assert rotated.refresh_token != first.refresh_token
    # replaying the consumed token must revoke the family
    with pytest.raises(TokenReuseError):
        await svc.refresh(first.refresh_token, ip=None, user_agent=None)
    with pytest.raises(AuthenticationError):
        await svc.refresh(rotated.refresh_token, ip=None, user_agent=None)
