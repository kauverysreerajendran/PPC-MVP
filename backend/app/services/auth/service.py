"""Authentication business rules: registration, login throttling, JWT issuance,
refresh-token rotation with reuse detection."""

from __future__ import annotations

import contextlib
from datetime import UTC, datetime, timedelta

from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AuthenticationError, ConflictError, TokenReuseError
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    needs_rehash,
    new_token_family,
    verify_password,
)
from app.infra import redis as r
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.repositories.refresh_token import RefreshTokenRepository
from app.repositories.user import UserRepository
from app.schemas.auth import RefreshResult, TokenResponse
from app.services.audit import record_audit
from app.workers.tasks.email import send_welcome_email

log = get_logger("app.auth")


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UserRepository(session)
        self.tokens = RefreshTokenRepository(session)

    # ---- registration -------------------------------------------------------
    async def register(self, email: str, password: str, full_name: str | None) -> User:
        if await self.users.email_exists(email):
            raise ConflictError("An account with that email already exists")
        user = User(
            email=email,
            full_name=full_name,
            hashed_password=hash_password(password),
            is_active=True,
        )
        await self.users.add(user)
        await record_audit(
            self.session,
            actor_id=user.id,
            action="user.register",
            entity="user",
            entity_id=str(user.id),
        )
        send_welcome_email.delay(user.id)
        return user

    # ---- login ------------------------------------------------------------
    async def authenticate(
        self, email: str, password: str, *, ip: str | None, user_agent: str | None
    ) -> RefreshResult:
        await self._check_login_throttle(email, ip)
        user = await self.users.get_by_email(email)
        if user is None or not verify_password(password, user.hashed_password):
            await self._register_failed_login(email, ip)
            raise AuthenticationError("Invalid email or password")
        if not user.is_active:
            raise AuthenticationError("Account is disabled")

        if needs_rehash(user.hashed_password):
            user.hashed_password = hash_password(password)
            await self.session.flush()

        await self._clear_login_throttle(email, ip)
        result = await self._issue_tokens(
            user, family_id=new_token_family(), ip=ip, user_agent=user_agent
        )
        await record_audit(
            self.session,
            actor_id=user.id,
            action="user.login",
            entity="user",
            entity_id=str(user.id),
            ip=ip,
        )
        return result

    # ---- refresh rotation ------------------------------------------------
    async def refresh(
        self, raw_token: str, *, ip: str | None, user_agent: str | None
    ) -> RefreshResult:
        token_hash = hash_refresh_token(raw_token)
        row = await self.tokens.get_by_hash(token_hash)
        now = datetime.now(UTC)

        if row is None:
            raise AuthenticationError("Invalid refresh token")

        if row.revoked_at is not None:
            await self.tokens.revoke_family(row.family_id)
            log.warning("refresh_token_reuse", family_id=row.family_id, user_id=row.user_id)
            raise TokenReuseError()

        # Reuse detection with a short grace window. A consumed token re-presented
        # within the grace period is almost always a benign retry (SSR double
        # render, a rotated cookie the client hasn't stored yet) rather than
        # theft — re-issue on the same family instead of nuking it. Genuine reuse
        # (an old token surfacing much later) still revokes the family.
        grace = timedelta(seconds=settings.REFRESH_REUSE_GRACE_SECONDS)
        if row.used_at is not None and now - row.used_at > grace:
            await self.tokens.revoke_family(row.family_id)
            log.warning("refresh_token_reuse", family_id=row.family_id, user_id=row.user_id)
            raise TokenReuseError()
        if row.expires_at <= now:
            raise AuthenticationError("Refresh token expired")

        user = await self.users.get(row.user_id)
        if user is None or not user.is_active:
            raise AuthenticationError("Account is disabled")

        # Slide the consumption timestamp so continued navigation keeps working.
        await self.tokens.mark_used(row)
        result = await self._issue_tokens(
            user, family_id=row.family_id, ip=ip, user_agent=user_agent
        )
        await record_audit(
            self.session,
            actor_id=user.id,
            action="user.token_refresh",
            entity="user",
            entity_id=str(user.id),
            ip=ip,
        )
        return result

    async def logout(self, raw_token: str) -> None:
        row = await self.tokens.get_by_hash(hash_refresh_token(raw_token))
        if row is not None:
            await self.tokens.revoke_family(row.family_id)

    # ---- helpers --------------------------------------------------------
    async def _issue_tokens(
        self, user: User, *, family_id: str, ip: str | None, user_agent: str | None
    ) -> RefreshResult:
        access = create_access_token(
            subject=str(user.id), role=user.role, email=user.email, name=user.full_name
        )
        raw_refresh = generate_refresh_token()
        expires_at = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        await self.tokens.add(
            RefreshToken(
                user_id=user.id,
                token_hash=hash_refresh_token(raw_refresh),
                family_id=family_id,
                expires_at=expires_at,
                ip_address=ip,
                user_agent=(user_agent or "")[:400] or None,
            )
        )
        return RefreshResult(
            access=TokenResponse(access_token=access),
            refresh_token=raw_refresh,
            refresh_expires_in=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        )

    def _throttle_key(self, email: str, ip: str | None) -> str:
        return f"acme:login:fail:{email.lower()}:{ip or 'noip'}"

    async def _check_login_throttle(self, email: str, ip: str | None) -> None:
        if not r.redis_available():
            return
        try:
            attempts = int(await r.client.get(self._throttle_key(email, ip)) or 0)
        except RedisError:
            r.note_redis_failure()
            return  # fail-open: don't lock users out because Redis is down
        if attempts >= settings.LOGIN_MAX_ATTEMPTS:
            raise AuthenticationError("Too many failed attempts. Try again later.")

    async def _register_failed_login(self, email: str, ip: str | None) -> None:
        if not r.redis_available():
            return
        with contextlib.suppress(RedisError):
            k = self._throttle_key(email, ip)
            n = await r.client.incr(k)
            if n == 1:
                await r.client.expire(k, settings.LOGIN_LOCKOUT_SECONDS)

    async def _clear_login_throttle(self, email: str, ip: str | None) -> None:
        if not r.redis_available():
            return
        with contextlib.suppress(RedisError):
            await r.client.delete(self._throttle_key(email, ip))
