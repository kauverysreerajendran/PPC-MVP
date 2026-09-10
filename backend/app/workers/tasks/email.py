from __future__ import annotations

from app.core.logging import get_logger
from app.integrations.email import EmailClient
from app.models.user import User
from app.workers.base import BaseTask, already_processed, db_session
from app.workers.celery_app import celery_app

log = get_logger("app.worker.email")


@celery_app.task(base=BaseTask, bind=True, name="app.workers.tasks.email.send_welcome_email")
def send_welcome_email(self, user_id: int) -> None:  # type: ignore[no-untyped-def]
    if already_processed(f"welcome:{user_id}"):
        log.info("welcome_email_skipped_duplicate", user_id=user_id)
        return
    with db_session() as session:
        user = session.get(User, user_id)
        if user is None:
            return
        EmailClient().send(
            to=user.email,
            subject="Welcome to Acme",
            body=f"Hi {user.full_name or 'there'}, your account is ready.",
        )
    log.info("welcome_email_sent", user_id=user_id)


@celery_app.task(base=BaseTask, bind=True, name="app.workers.tasks.email.send_password_reset")
def send_password_reset(self, email: str, token: str) -> None:  # type: ignore[no-untyped-def]
    EmailClient().send(
        to=email,
        subject="Reset your Acme password",
        body=f"Use this link within 30 minutes: https://app.acme.test/reset?token={token}",
    )
