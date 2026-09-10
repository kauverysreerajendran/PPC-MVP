"""Environment-based configuration. Typed, validated at import, fail-fast in production."""

from __future__ import annotations

import enum
from functools import lru_cache
from typing import Annotated

from pydantic import Field, PostgresDsn, RedisDsn, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_PLACEHOLDERS = {"", "change-me", "dev-only-change-me-please-0000000000000000000000000000"}


class Environment(str, enum.Enum):
    development = "development"
    test = "test"
    staging = "staging"
    production = "production"

    @property
    def is_production_like(self) -> bool:
        return self in (Environment.staging, Environment.production)


class Settings(BaseSettings):
    # `../.env` lets scripts run from backend/ (uvicorn, alembic, python -m app.*)
    # pick up the repo-root .env during local dev. Under Docker/CI the env is
    # injected and neither file exists, so this is a no-op there.
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), extra="ignore", case_sensitive=True
    )

    # --- global ---
    ENVIRONMENT: Environment = Environment.development
    DEBUG: bool = False
    PROJECT_NAME: str = "Acme SaaS"
    LOG_LEVEL: str = "INFO"

    # --- api ---
    API_V1_PREFIX: str = "/api/v1"
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(default_factory=list)

    # --- auth ---
    SECRET_KEY: str = "dev-only-change-me-please-0000000000000000000000000000"  # noqa: S105
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    PASSWORD_MIN_LENGTH: int = 10
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_SECONDS: int = 900
    # Grace window during which a just-rotated refresh token can be re-presented
    # without tripping reuse detection (SSR double-render / cookie propagation lag).
    REFRESH_REUSE_GRACE_SECONDS: int = 90

    # --- database ---
    DATABASE_URL: PostgresDsn
    DATABASE_RO_URL: str | None = None
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_RECYCLE_SECONDS: int = 1800

    # --- redis / cache ---
    REDIS_URL: RedisDsn
    # Set false in environments with no Redis (e.g. local dev) so the fail-open
    # cache / rate-limit paths skip it entirely instead of paying a socket
    # timeout on the first request of every circuit-breaker cooldown.
    REDIS_ENABLED: bool = True
    CACHE_DEFAULT_TTL_SECONDS: int = 300
    RATE_LIMIT_DEFAULT: str = "100/minute"

    # --- celery ---
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str
    CELERY_TASK_SOFT_TIME_LIMIT: int = 30
    CELERY_TASK_TIME_LIMIT: int = 60

    # --- email ---
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1025
    SMTP_TLS: bool = False
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAIL_FROM: str = "no-reply@acme.test"

    # --- observability ---
    SENTRY_DSN: str | None = None
    OTEL_EXPORTER_OTLP_ENDPOINT: str | None = None
    METRICS_ENABLED: bool = True

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v: str | list[str] | None) -> list[str]:
        if v is None or v == "":
            return []
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return list(v)

    @property
    def database_ro_url(self) -> str:
        return self.DATABASE_RO_URL or str(self.DATABASE_URL)

    @model_validator(mode="after")
    def _validate_production(self) -> Settings:
        if self.ENVIRONMENT.is_production_like:
            problems: list[str] = []
            if self.SECRET_KEY in _PLACEHOLDERS or len(self.SECRET_KEY) < 32:
                problems.append("SECRET_KEY must be a strong non-default value")
            if self.DEBUG:
                problems.append("DEBUG must be false")
            if not self.BACKEND_CORS_ORIGINS:
                problems.append("BACKEND_CORS_ORIGINS must be an explicit allowlist")
            if problems:
                raise RuntimeError("Invalid production configuration: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
