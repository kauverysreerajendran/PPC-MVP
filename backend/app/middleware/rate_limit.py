"""Distributed token-bucket rate limiter backed by Redis.

Fail-open: if Redis is unreachable the request is allowed (logged + metric),
so a cache outage never takes the API down.
"""

from __future__ import annotations

import time

from redis.exceptions import RedisError
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import settings
from app.core.context import request_id_ctx
from app.core.logging import get_logger
from app.core.metrics import rate_limit_rejections_total
from app.infra import redis as r

log = get_logger("app.ratelimit")

_LUA = """
local tokens_key = KEYS[1]
local ts_key = KEYS[2]
local rate = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local last_tokens = tonumber(redis.call('get', tokens_key) or capacity)
local last_ts = tonumber(redis.call('get', ts_key) or now)
local delta = math.max(0, now - last_ts)
local filled = math.min(capacity, last_tokens + delta * rate)
local allowed = filled >= requested
local new_tokens = allowed and filled - requested or filled
local ttl = math.ceil(capacity / rate) * 2
redis.call('set', tokens_key, new_tokens, 'EX', ttl)
redis.call('set', ts_key, now, 'EX', ttl)
return { allowed and 1 or 0, math.floor(new_tokens) }
"""


def _parse(spec: str) -> tuple[float, int]:
    count, _, unit = spec.partition("/")
    per = {"second": 1, "minute": 60, "hour": 3600}[unit.strip().rstrip("s")]
    capacity = int(count)
    return capacity / per, capacity


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp, *, exempt_paths: tuple[str, ...] = ()) -> None:
        self.app = app
        self.rate, self.capacity = _parse(settings.RATE_LIMIT_DEFAULT)
        self.exempt = exempt_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        if any(request.url.path.startswith(p) for p in self.exempt):
            await self.app(scope, receive, send)
            return

        # Breaker open (Redis known-down): skip entirely, stay fast.
        if not r.redis_available():
            await self.app(scope, receive, send)
            return

        identity = _client_identity(request)
        try:
            allowed, _remaining = await r.client.eval(
                _LUA,
                2,
                f"rl:{identity}:tokens",
                f"rl:{identity}:ts",
                self.rate,
                self.capacity,
                time.time(),
                1,
            )
            r.note_redis_success()
        except RedisError:
            r.note_redis_failure()
            log.warning("rate_limit_failopen", identity=identity)
            await self.app(scope, receive, send)
            return

        if not allowed:
            rate_limit_rejections_total.labels("api").inc()
            retry_after = max(1, int(1 / self.rate))
            response = JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "rate_limited",
                        "message": "Too many requests",
                        "request_id": request_id_ctx.get(),
                        "status": 429,
                    }
                },
                headers={"Retry-After": str(retry_after)},
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)


def _client_identity(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return f"tok:{hash(auth) & 0xFFFFFFFF}"
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "anon")
    return f"ip:{ip}"
