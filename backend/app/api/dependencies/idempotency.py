"""Optional idempotency for mutating endpoints via the `Idempotency-Key` header.

Stores the response for (user, method, path, key) in Redis for 24h and replays it.
Redis outage -> feature silently no-ops (request proceeds normally).
"""

from __future__ import annotations

import contextlib
import hashlib
import json
from typing import Annotated

from fastapi import Depends, Header, Request
from redis.exceptions import RedisError

from app.api.dependencies.auth import CurrentUser
from app.infra import redis as r

_TTL = 86_400


class IdempotencyGuard:
    def __init__(self, key: str | None, request: Request, user_id: int) -> None:
        self.enabled = bool(key)
        raw = f"{user_id}:{request.method}:{request.url.path}:{key}"
        self.redis_key = "acme:idem:" + hashlib.sha256(raw.encode()).hexdigest()

    async def replay(self) -> dict | None:
        if not self.enabled or not r.redis_available():
            return None
        try:
            cached = await r.client.get(self.redis_key)
        except RedisError:
            r.note_redis_failure()
            return None
        return json.loads(cached) if cached else None

    async def store(self, status_code: int, body: dict) -> None:
        if not self.enabled or not r.redis_available():
            return
        with contextlib.suppress(RedisError):
            await r.client.set(
                self.redis_key,
                json.dumps({"status": status_code, "body": body}, default=str),
                ex=_TTL,
                nx=True,
            )


async def idempotency(
    request: Request,
    user: CurrentUser,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> IdempotencyGuard:
    return IdempotencyGuard(idempotency_key, request, user.id)


Idempotency = Annotated[IdempotencyGuard, Depends(idempotency)]
