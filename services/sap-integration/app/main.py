"""ASGI entrypoint for the SAP Integration Service."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app import __version__
from app.admin import init_admin
from app.api import router as sap_router
from app.config import settings
from app.db import dispose_engine, engine
from app.errors import init_error_handlers
from app.sync_loop import sync_loop
from app.timing import ServerTimingMiddleware

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("sap-integration")


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("startup service=%s env=%s provider=%s", settings.SERVICE_NAME, settings.ENVIRONMENT, settings.SAP_PROVIDER)

    # Automatic SAP pull. One task per process; an advisory lock inside the task
    # keeps several workers from pulling at once (see app/sync_loop.py).
    stop = asyncio.Event()
    task: asyncio.Task[None] | None = None
    if settings.SAP_AUTO_SYNC_ENABLED:
        task = asyncio.create_task(sync_loop(stop), name="sap-auto-sync")
        log.info("auto-sync every %ss (count=%s)", settings.SAP_AUTO_SYNC_SECONDS, settings.SAP_AUTO_SYNC_COUNT)
    else:
        log.info("auto-sync disabled; pulls are manual (POST %s/sync)", settings.API_PREFIX)

    try:
        yield
    finally:
        stop.set()
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        await dispose_engine()
        log.info("shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="SAP Integration Service",
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

    @app.get("/healthz", include_in_schema=False)
    async def healthz() -> dict[str, str]:
        # Liveness only (docs/10 §4.1) — no dependency checks.
        return {"status": "ok", "service": settings.SERVICE_NAME}

    @app.get("/readyz", include_in_schema=False)
    async def readyz() -> dict[str, str]:
        # Readiness (docs/10 §4.1): database reachable.
        db_ok = "ok"
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception as exc:  # noqa: BLE001
            db_ok = f"error: {exc.__class__.__name__}"
        return {
            "status": "ok" if db_ok == "ok" else "degraded",
            "service": settings.SERVICE_NAME,
            "database": db_ok,
        }

    app.include_router(sap_router, prefix=settings.API_PREFIX)
    init_admin(app)  # browser DB admin at /sap-admin
    return app


app = create_app()


def run() -> None:  # `python -m app.main`
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.SAP_SERVICE_HOST,
        port=settings.SAP_SERVICE_PORT,
        reload=settings.ENVIRONMENT == "development",
    )


if __name__ == "__main__":
    run()
