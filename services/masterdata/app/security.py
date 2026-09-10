"""Gateway-forwarded JWT verification.

The service trusts the shared HS256 ``SECRET_KEY`` (same as the monolith). It
only needs to know *who* the caller is — fine-grained permission checks stay in
the issuing services for this pass (see BLUEPRINT §0.4 / OPEN-Q51). Mirrors
`services/sap-integration/app/security.py`.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

_bearer = HTTPBearer(auto_error=not settings.MASTERDATA_AUTH_OPTIONAL)


@dataclass(frozen=True)
class Principal:
    subject: str
    role: str | None


async def current_principal(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> Principal:
    if creds is None:
        if settings.MASTERDATA_AUTH_OPTIONAL:
            return Principal(subject="anonymous", role=None)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    try:
        claims = jwt.decode(
            creds.credentials, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc
    if claims.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong token type")
    return Principal(subject=str(claims.get("sub", "")), role=claims.get("role"))
