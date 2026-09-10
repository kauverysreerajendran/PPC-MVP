"""Shared task base: retry policy, DLQ on exhaustion, sync DB session, idempotency."""

from __future__ import annotations

import contextlib
from collections.abc import Iterator

import redis
from celery import Task
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.logging import get_logger
from app.core.metrics import celery_tasks_total

log = get_logger("app.worker")
_DLQ_KEY = "acme:dlq"

# Workers use a *sync* engine/driver — Celery is not async. Built lazily so that
# merely importing this module (e.g. from the API process) is side-effect free.
_engine = None
_session_factory: sessionmaker | None = None
_redis: redis.Redis | None = None


def _get_session_factory() -> sessionmaker:
    global _engine, _session_factory
    if _session_factory is None:
        dsn = str(settings.DATABASE_URL).replace("+asyncpg", "+psycopg")
        _engine = create_engine(dsn, pool_pre_ping=True, pool_size=5, max_overflow=5)
        _session_factory = sessionmaker(_engine, expire_on_commit=False)
    return _session_factory


def _get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.Redis.from_url(str(settings.REDIS_URL), decode_responses=True)
    return _redis


@contextlib.contextmanager
def db_session() -> Iterator[Session]:
    session = _get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def already_processed(key: str, ttl: int = 86_400) -> bool:
    """Idempotency guard: returns True if this key was already handled."""
    return not bool(_get_redis().set(f"acme:idem:task:{key}", "1", nx=True, ex=ttl))


class BaseTask(Task):
    autoretry_for = (Exception,)
    max_retries = 5
    retry_backoff = True  # exponential
    retry_backoff_max = 600
    retry_jitter = True
    acks_late = True

    def on_success(self, retval, task_id, args, kwargs):  # type: ignore[no-untyped-def]
        celery_tasks_total.labels(self.name, "success").inc()

    def on_retry(self, exc, task_id, args, kwargs, einfo):  # type: ignore[no-untyped-def]
        celery_tasks_total.labels(self.name, "retry").inc()
        log.warning("task_retry", task=self.name, error=str(exc))

    def on_failure(self, exc, task_id, args, kwargs, einfo):  # type: ignore[no-untyped-def]
        celery_tasks_total.labels(self.name, "failure").inc()
        log.error("task_failed_final", task=self.name, task_id=task_id, error=str(exc))
        with contextlib.suppress(Exception):
            _get_redis().lpush(
                _DLQ_KEY,
                f'{{"task":"{self.name}","id":"{task_id}","args":{list(args)!r},"error":{str(exc)!r}}}',
            )
