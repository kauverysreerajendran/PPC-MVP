"""Typed configuration for the SAP Integration Service.

Reads the repo-root `.env` during native local dev (so `SAP_DATABASE_URL` and the
shared `SECRET_KEY` live in one place), and the process environment under
Docker / CI.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_PLACEHOLDERS = {"", "change-me", "dev-only-change-me-please-0000000000000000000000000000"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "../../.env"), extra="ignore", case_sensitive=True
    )

    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    SERVICE_NAME: str = "sap-integration-service"

    # --- api ---
    API_PREFIX: str = "/api/v1/sap"
    SAP_SERVICE_HOST: str = "0.0.0.0"  # noqa: S104 - dev bind
    SAP_SERVICE_PORT: int = 8001
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(default_factory=list)

    # --- auth (shared HS256 secret with the monolith / gateway) ---
    SECRET_KEY: str = "dev-only-change-me-please-0000000000000000000000000000"  # noqa: S105
    JWT_ALGORITHM: str = "HS256"
    # Set true to skip JWT verification in isolated local testing only.
    SAP_AUTH_OPTIONAL: bool = False
    # Browser DB admin at /admin. Open on localhost in development; elsewhere this
    # password gates it.
    SAP_ADMIN_PASSWORD: str = "sap-admin"  # noqa: S105

    # --- database (this service's OWN database) ---
    SAP_DATABASE_URL: PostgresDsn
    SAP_DB_POOL_SIZE: int = 5
    SAP_DB_MAX_OVERFLOW: int = 10
    SAP_DB_POOL_RECYCLE_SECONDS: int = 1800

    # --- SAP provider ---
    # mock -> deterministic sample data; real providers wired when Titan confirms
    # the SAP interface (OData / BAPI / RFC).  TITAN_SAP_*_TO_BE_CONFIRMED.
    SAP_PROVIDER: str = "mock"
    SAP_SOURCE_SYSTEM: str = "SAP-ECC"

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
