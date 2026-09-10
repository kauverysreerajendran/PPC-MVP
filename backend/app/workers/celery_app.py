"""Celery application. Workers are stateless and horizontally scalable."""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings
from app.core.logging import configure_logging

configure_logging()

celery_app = Celery(
    "acme",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.workers.tasks.email",
        "app.workers.tasks.maintenance",
    ],
)

celery_app.conf.update(
    task_acks_late=True,  # redeliver if a worker dies mid-task
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,  # fair dispatch for long tasks
    task_soft_time_limit=settings.CELERY_TASK_SOFT_TIME_LIMIT,
    task_time_limit=settings.CELERY_TASK_TIME_LIMIT,
    task_default_queue="default",
    task_track_started=True,
    result_expires=3600,
    task_default_retry_delay=5,
    task_routes={
        "app.workers.tasks.email.*": {"queue": "emails"},
        "app.workers.tasks.maintenance.*": {"queue": "maintenance"},
    },
    beat_schedule={
        "purge-expired-refresh-tokens": {
            "task": "app.workers.tasks.maintenance.purge_expired_refresh_tokens",
            "schedule": crontab(minute=0, hour="*/6"),
        },
    },
)
