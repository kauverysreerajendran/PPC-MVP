"""Typed configuration for the Rack Service.

Reads the repo-root `.env` during native local dev (so `RACK_DATABASE_URL`
and the shared `SECRET_KEY` live in one place), and the process environment under
Docker / CI. Mirrors `services/masterdata/app/config.py`.
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
    SERVICE_NAME: str = "rack-service"

    # --- api ---
    API_PREFIX: str = "/api/v1/rack"
    RACK_SERVICE_HOST: str = "0.0.0.0"  # noqa: S104 - dev bind
    RACK_SERVICE_PORT: int = 8003
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(default_factory=list)

    # --- auth (shared HS256 secret with the monolith / gateway) ---
    SECRET_KEY: str = "dev-only-change-me-please-0000000000000000000000000000"  # noqa: S105
    JWT_ALGORITHM: str = "HS256"
    # Set true to skip JWT verification in isolated local testing only.
    RACK_AUTH_OPTIONAL: bool = False
    # Browser DB admin at /rack-admin. Open on localhost in development;
    # elsewhere this password gates it.
    RACK_ADMIN_PASSWORD: str = "rack-admin"  # noqa: S105

    # --- database (this service's OWN database) ---
    RACK_DATABASE_URL: PostgresDsn
    RACK_DB_POOL_SIZE: int = 5
    RACK_DB_MAX_OVERFLOW: int = 10
    RACK_DB_POOL_RECYCLE_SECONDS: int = 1800

    # --- Masterdata service (read-only, over HTTP — never its DB) ---
    # Used to validate `occupied_by_model` against the model master when a slot
    # is occupied. Best-effort: if the Masterdata service is unreachable the
    # write still succeeds (see BLUEPRINT §12 — no cross-service DB access).
    RACK_MASTERDATA_API_BASE_URL: AnyHttpUrl = "http://localhost:8002/api/v1/masterdata"  # type: ignore[assignment]
    RACK_MASTERDATA_TOKEN: str = ""  # optional bearer for the Masterdata service
    RACK_VALIDATE_MODEL: bool = False  # opt-in cross-service model check on occupy

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
