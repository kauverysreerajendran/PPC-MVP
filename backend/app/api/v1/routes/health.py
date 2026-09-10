from __future__ import annotations

from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.db.session import engine_ro
from app.infra import redis as r

router = APIRouter(tags=["health"])
_started = False


@router.get("/healthz", summary="Liveness")
async def healthz() -> dict[str, str]:
    """Process is alive and the event loop responds. Never touches dependencies."""
    return {"status": "ok"}


@router.get("/readyz", summary="Readiness")
async def readyz(response: Response) -> dict:
    checks: dict[str, str] = {}
    ok = True

    try:
        async with engine_ro.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "fail"
        ok = False

    checks["redis"] = "ok" if await r.ping() else "degraded"

    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ok" if ok else "unavailable", "checks": checks}


@router.get("/startupz", summary="Startup")
async def startupz(response: Response) -> dict:
    global _started
    if not _started:
        _started = await r.ping()
    if not _started:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ready" if _started else "starting"}
