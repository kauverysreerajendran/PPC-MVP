"""Typed configuration for the Masterdata Service.

Reads the repo-root `.env` during native local dev (so `MASTERDATA_DATABASE_URL`
and the shared `SECRET_KEY` live in one place), and the process environment under
Docker / CI. Mirrors `services/sap-integration/app/config.py`.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import AnyHttpUrl, Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "../../.env"), extra="ignore", case_sensitive=True
    )

    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    SERVICE_NAME: str = "masterdata-service"

    # --- api ---
    API_PREFIX: str = "/api/v1/masterdata"
    MASTERDATA_SERVICE_HOST: str = "0.0.0.0"  # noqa: S104 - dev bind
    MASTERDATA_SERVICE_PORT: int = 8002
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(default_factory=list)

    # --- auth (shared HS256 secret with the monolith / gateway) ---
    SECRET_KEY: str = "dev-only-change-me-please-0000000000000000000000000000"  # noqa: S105
    JWT_ALGORITHM: str = "HS256"
    # Set true to skip JWT verification in isolated local testing only.
    MASTERDATA_AUTH_OPTIONAL: bool = False
    # Browser DB admin at /masterdata-admin. Open on localhost in development;
    # elsewhere this password gates it.
    MASTERDATA_ADMIN_PASSWORD: str = "masterdata-admin"  # noqa: S105

    # --- database (this service's OWN database) ---
    MASTERDATA_DATABASE_URL: PostgresDsn
    MASTERDATA_DB_POOL_SIZE: int = 5
    MASTERDATA_DB_MAX_OVERFLOW: int = 10
    MASTERDATA_DB_POOL_RECYCLE_SECONDS: int = 1800

    # --- SAP Integration service (read-only, over HTTP — never its DB) ---
    # Used by `python -m app.seed` to import distinct vendors / models from the
    # real SAP inward feed into the masterdata tables. No cross-service DB access.
    MASTERDATA_SAP_API_BASE_URL: AnyHttpUrl = "http://localhost:8001/api/v1/sap"  # type: ignore[assignment]
    MASTERDATA_SEED_TOKEN: str = ""  # optional bearer for the SAP service

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
