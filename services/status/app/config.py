"""Typed configuration for the Status Service.

Reads the repo-root `.env` during native local dev (so `STATUS_DATABASE_URL`
and the shared `SECRET_KEY` live in one place), and the process environment under
Docker / CI. Mirrors `services/rack/app/config.py`.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "../../.env"), extra="ignore", case_sensitive=True
    )

    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    SERVICE_NAME: str = "status-service"

    # --- api ---
    API_PREFIX: str = "/api/v1/status"
    STATUS_SERVICE_HOST: str = "0.0.0.0"
    STATUS_SERVICE_PORT: int = 8004
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(default_factory=list)

    # --- auth (shared HS256 secret with the monolith / gateway) ---
    SECRET_KEY: str = "dev-only-change-me-please-0000000000000000000000000000"
    JWT_ALGORITHM: str = "HS256"
    # Set true to skip JWT verification in isolated local testing only.
    STATUS_AUTH_OPTIONAL: bool = False

    # --- database ---
    # Points at the single shared PostgreSQL database (see repo-root `.env`).
    # This service owns and migrates only its `status` schema there — never
    # another service's schema.
    STATUS_DATABASE_URL: PostgresDsn
    STATUS_DB_POOL_SIZE: int = 5
    STATUS_DB_MAX_OVERFLOW: int = 10
    STATUS_DB_POOL_RECYCLE_SECONDS: int = 1800

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v: str | list[str] | None) -> list[str]:
        if not v:
            return []
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return list(v)

    @property
    def is_production_like(self) -> bool:
        return self.ENVIRONMENT in ("staging", "production")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
