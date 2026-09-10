from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.config import settings


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = Field(default=None, max_length=200)

    @field_validator("password")
    @classmethod
    def _strength(cls, v: str) -> str:
        if len(v) < settings.PASSWORD_MIN_LENGTH:
            raise ValueError(f"password must be at least {settings.PASSWORD_MIN_LENGTH} characters")
        if v.lower() == v or v.upper() == v or not any(c.isdigit() for c in v):
            raise ValueError("password needs upper, lower, and a digit")
        return v


class LoginRequest(BaseModel):
    # Login only needs an identifier, not a deliverable address — this lets dev
    # accounts (e.g. "dev") sign in. Registration still enforces EmailStr.
    email: str = Field(min_length=1)
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105  not a secret
    expires_in: int = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


class RefreshResult(BaseModel):
    """Internal DTO: what the service hands back to the router."""

    access: TokenResponse
    refresh_token: str
    refresh_expires_in: int
