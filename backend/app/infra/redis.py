"""Single shared async Redis client + a resilient wrapper.

Failure policy: transient Redis errors are swallowed by the cache/rate-limit layers
(fail-open) and logged. Features that *require* Redis (locks, sessions) raise.
"""

from __future__ import annotations

import contextlib
import time
from collections.abc import AsyncIterator

import redis.asyncio as redis
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("app.redis")

_pool = redis.ConnectionPool.from_url(
    str(settings.REDIS_URL),
    decode_responses=True,
    max_connections=50,
    # Fail fast when Redis is unreachable so the fail-open cache / rate-limit
    # paths don't stall each request waiting on a dead socket.
    socket_connect_timeout=0.5,
    socket_timeout=0.5,
)
client: redis.Redis = redis.Redis(connection_pool=_pool)

# ---- circuit breaker -------------------------------------------------------
# Without Redis running, every fail-open path would still pay a full socket
# timeout per request. Once a call fails we "open the circuit" for a short
# cooldown so subsequent requests skip Redis entirely (instant) until we
# re-probe. This keeps the whole API fast when Redis is simply not running.
# 120 s (was 20 s): with Redis down, every re-probe costs one request a full
# socket timeout (0.5 s). One stall per two minutes instead of per 20 s keeps
# the fail-open path fast (docs/09 §1, guardrails §3.9).
_CIRCUIT_COOLDOWN_SECONDS = 120.0
_circuit_open_until = 0.0


def redis_available() -> bool:
    """False while the breaker is open — callers should skip Redis and degrade."""
    if not settings.REDIS_ENABLED:
        return False
    return time.monotonic() >= _circuit_open_until


def note_redis_failure() -> None:
    global _circuit_open_until
    was_closed = redis_available()
    _circuit_open_until = time.monotonic() + _CIRCUIT_COOLDOWN_SECONDS
    if was_closed:
        log.warning("redis_circuit_open", cooldown_s=_CIRCUIT_COOLDOWN_SECONDS)


def note_redis_success() -> None:
    global _circuit_open_until
    if not redis_available():
        log.info("redis_circuit_closed")
    _circuit_open_until = 0.0


async def ping() -> bool:
    try:
        return bool(await client.ping())
    except RedisError:
        return False


async def close() -> None:
    with contextlib.suppress(Exception):
        await client.aclose()


class DistributedLock:
    """`SET key token NX PX ttl` lock with safe release via Lua CAS.

    Requires Redis; callers must handle acquisition failure.
    """

    _RELEASE = (
        "if redis.call('get', KEYS[1]) == ARGV[1] "
        "then return redis.call('del', KEYS[1]) else return 0 end"
    )

    def __init__(self, key: str, ttl_ms: int = 10_000) -> None:
        self.key = f"lock:{key}"
        self.ttl_ms = ttl_ms
        self._token = ""

    async def acquire(self) -> bool:
        import secrets

        self._token = secrets.token_hex(16)
        return bool(await client.set(self.key, self._token, nx=True, px=self.ttl_ms))

    async def release(self) -> None:
        with contextlib.suppress(RedisError):
            await client.eval(self._RELEASE, 1, self.key, self._token)


@contextlib.asynccontextmanager
async def lock(key: str, ttl_ms: int = 10_000) -> AsyncIterator[bool]:
    dl = DistributedLock(key, ttl_ms)
    acquired = await dl.acquire()
    try:
        yield acquired
    finally:
        if acquired:
            await dl.release()
