"""ASGI entrypoint for the SAP Integration Service."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.admin import init_admin
from app.api import router as sap_router
from app.config import settings
from app.db import dispose_engine

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("sap-integration")


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("startup service=%s env=%s provider=%s", settings.SERVICE_NAME, settings.ENVIRONMENT, settings.SAP_PROVIDER)
    yield
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

    @app.get("/healthz", include_in_schema=False)
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": settings.SERVICE_NAME}

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
