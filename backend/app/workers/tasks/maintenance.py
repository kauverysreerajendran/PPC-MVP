from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete

from app.core.logging import get_logger
from app.models.refresh_token import RefreshToken
from app.workers.base import BaseTask, db_session
from app.workers.celery_app import celery_app

log = get_logger("app.worker.maintenance")


@celery_app.task(
    base=BaseTask,
    bind=True,
    name="app.workers.tasks.maintenance.purge_expired_refresh_tokens",
)
def purge_expired_refresh_tokens(self) -> int:  # type: ignore[no-untyped-def]
    with db_session() as session:
        result = session.execute(
            delete(RefreshToken).where(RefreshToken.expires_at < datetime.now(UTC))
        )
        count = result.rowcount or 0
    log.info("purged_expired_refresh_tokens", count=count)
    return count
