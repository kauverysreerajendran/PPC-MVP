"""FastAPI application factory. The single ASGI entrypoint for every replica."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.admin import init_admin
from app.api.v1.router import api_router
from app.api.v1.routes.health import router as health_router
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.db.session import dispose_engines
from app.infra import redis as redis_infra
from app.middleware import install_middleware
from app.observability import init_observability

log = get_logger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    init_observability()
    log.info("startup", environment=settings.ENVIRONMENT.value, version=_version())
    yield
    await redis_infra.close()
    await dispose_engines()
    log.info("shutdown")


def _version() -> str:
    from app import __version__

    return __version__


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=_version(),
        docs_url=f"{settings.API_V1_PREFIX}/docs",
        redoc_url=f"{settings.API_V1_PREFIX}/redoc",
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
        lifespan=lifespan,
    )
    install_middleware(app)
    register_exception_handlers(app)
    app.include_router(health_router)
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    # Django-style DB admin UI at /admin (SQLAdmin). Isolated in app.admin;
    # protected by its own AuthenticationBackend (see app/admin/authentication.py).
    init_admin(app)
    return app


app = create_app()
