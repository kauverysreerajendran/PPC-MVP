"""Cache-aside helper with jittered TTL and single-flight stampede protection.

Key convention:  acme:<version>:<domain>:<identifier>
Serialization:   JSON (portable, debuggable). Swap to msgpack behind this module if needed.
Degradation:     any RedisError -> treated as a miss; the caller's loader runs against the DB.
"""

from __future__ import annotations

import asyncio
import json
import random
from collections.abc import Awaitable, Callable

from redis.exceptions import RedisError

from app.core.config import settings
from app.core.metrics import cache_events_total
from app.infra import redis as r

CACHE_VERSION = "v1"


def key(domain: str, identifier: str) -> str:
    return f"acme:{CACHE_VERSION}:{domain}:{identifier}"


def _ttl(ttl: int | None) -> int:
    base = ttl or settings.CACHE_DEFAULT_TTL_SECONDS
    return base + random.randint(0, max(1, base // 10))  # noqa: S311  jitter, not crypto


async def get_or_set[T](
    cache_key: str,
    loader: Callable[[], Awaitable[T]],
    *,
    ttl: int | None = None,
    lock_ttl_ms: int = 5_000,
) -> T:
    if not r.redis_available():
        return await loader()

    try:
        cached = await r.client.get(cache_key)
        if cached is not None:
            cache_events_total.labels("hit").inc()
            return json.loads(cached)
    except RedisError:
        cache_events_total.labels("error").inc()
        r.note_redis_failure()
        return await loader()

    cache_events_total.labels("miss").inc()

    # single-flight: one caller repopulates, others briefly wait then read.
    async with r.lock(f"cache:{cache_key}", lock_ttl_ms) as got_lock:
        if not got_lock:
            await asyncio.sleep(0.05)
            try:
                cached = await r.client.get(cache_key)
                if cached is not None:
                    return json.loads(cached)
            except RedisError:
                pass
        value = await loader()
        with_suppressed_redis_errors = True
        if with_suppressed_redis_errors:
            try:
                await r.client.set(cache_key, json.dumps(value, default=str), ex=_ttl(ttl))
            except RedisError:
                cache_events_total.labels("error").inc()
        return value


async def invalidate(*cache_keys: str) -> None:
    try:
        if cache_keys:
            await r.client.delete(*cache_keys)
    except RedisError:
        cache_events_total.labels("error").inc()


async def invalidate_prefix(prefix: str) -> None:
    try:
        async for k in r.client.scan_iter(match=f"{prefix}*", count=200):
            await r.client.delete(k)
    except RedisError:
        cache_events_total.labels("error").inc()
