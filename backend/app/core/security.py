"""Password hashing + JWT / refresh-token primitives. No DB or HTTP here."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import settings

_ph = PasswordHasher()
TokenType = Literal["access"]


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        _ph.verify(hashed, password)
        return True
    except VerifyMismatchError:
        return False
    except Exception:  # malformed hash, legacy scheme, etc.
        return False


def needs_rehash(hashed: str) -> bool:
    try:
        return _ph.check_needs_rehash(hashed)
    except Exception:
        return True


def create_access_token(
    *,
    subject: str,
    role: str,
    email: str | None = None,
    name: str | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    """Signed access JWT.

    Besides ``sub``/``role`` it carries the display identity (``email``, ``name``)
    so a server-rendered shell can show the signed-in user without calling
    ``/auth/me`` on every navigation. Claims only — nothing here is used for
    authorization beyond ``sub``/``role``, which are unchanged.
    """
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "email": email,
        "name": name,
        "type": "access",
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        claims = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:  # expired, bad signature, malformed
        raise ValueError(str(exc)) from exc
    if claims.get("type") != "access":
        raise ValueError("wrong token type")
    return claims


def generate_refresh_token() -> str:
    """Opaque, high-entropy token. Only its hash is persisted."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_token_family() -> str:
    return str(uuid.uuid4())
