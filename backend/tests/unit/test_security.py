import pytest
from app.core.security import (
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)

pytestmark = pytest.mark.unit


def test_password_hash_roundtrip():
    h = hash_password("Sup3rSecret!")
    assert h != "Sup3rSecret!"
    assert verify_password("Sup3rSecret!", h)
    assert not verify_password("wrong", h)


def test_access_token_roundtrip():
    token = create_access_token(subject="42", role="member")
    claims = decode_access_token(token)
    assert claims["sub"] == "42"
    assert claims["role"] == "member"
    assert claims["type"] == "access"


def test_access_token_rejects_tampered():
    token = create_access_token(subject="42", role="member")
    with pytest.raises(ValueError):
        decode_access_token(token + "x")


def test_refresh_token_is_opaque_and_hashed():
    raw = generate_refresh_token()
    assert len(raw) > 40
    assert hash_refresh_token(raw) == hash_refresh_token(raw)
    assert hash_refresh_token(raw) != raw
