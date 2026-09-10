from __future__ import annotations

from fastapi import APIRouter, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.api.dependencies.auth import CurrentUser
from app.api.v1.routes import auth, projects, users
from app.core.metrics import registry

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(projects.router)


@api_router.get("/metrics", include_in_schema=False)
async def metrics(_: Request) -> Response:
    return Response(generate_latest(registry), media_type=CONTENT_TYPE_LATEST)


@api_router.get("/whoami", tags=["auth"], include_in_schema=False)
async def whoami(user: CurrentUser) -> dict:
    return {"id": user.id, "role": user.role}
