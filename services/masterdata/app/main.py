"""ASGI entrypoint for the Masterdata Service."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app import __version__
from app.admin import init_admin
from app.api import router as masterdata_router
from app.config import settings
from app.db import dispose_engine, engine
from app.errors import init_error_handlers
from app.timing import ServerTimingMiddleware
from app.schemas import HealthOut

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("masterdata")


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("startup service=%s env=%s", settings.SERVICE_NAME, settings.ENVIRONMENT)
    yield
    await dispose_engine()
    log.info("shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Masterdata Service",
        version=__version__,
        docs_url=f"{settings.API_PREFIX}/docs",
        openapi_url=f"{settings.API_PREFIX}/openapi.json",
        lifespan=lifespan,
    )
    if settings.BACKEND_CORS_ORIGINS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.BACKEND_CORS_ORIGINS,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    init_error_handlers(app)
    app.add_middleware(ServerTimingMiddleware)  # docs/10 §7

    @app.get("/healthz", response_model=HealthOut, include_in_schema=False)
    async def health() -> HealthOut:
        """Liveness (docs/10 §4.1): the process is up. No dependency checks —
        compose probes this every 10 s and a DB round-trip per probe is
        avoidable load. Readiness with the DB check is ``/readyz`` below."""
        return HealthOut(status="ok", service=settings.SERVICE_NAME, database="not-checked")

    @app.get("/readyz", response_model=HealthOut, include_in_schema=False)
    @app.get(f"{settings.API_PREFIX}/health", response_model=HealthOut, tags=["meta"])
    async def ready() -> HealthOut:
        """Readiness (docs/10 §4.1): database reachable."""
        db_ok = "ok"
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception as exc:  # noqa: BLE001
            db_ok = f"error: {exc.__class__.__name__}"
        return HealthOut(status="ok" if db_ok == "ok" else "degraded", service=settings.SERVICE_NAME, database=db_ok)

    app.include_router(masterdata_router, prefix=settings.API_PREFIX)
    init_admin(app)  # browser DB admin at /masterdata-admin
    return app


app = create_app()


def run() -> None:  # `python -m app.main`
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.MASTERDATA_SERVICE_HOST,
        port=settings.MASTERDATA_SERVICE_PORT,
        reload=settings.ENVIRONMENT == "development",
    )


if __name__ == "__main__":
    run()
