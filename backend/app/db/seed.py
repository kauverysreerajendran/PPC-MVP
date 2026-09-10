"""Idempotent local-dev seed. `python -m app.db.seed`.

Creates only the local development login (username "dev", password "dev").
No demo or sample business data — every record in the app comes from real use.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.admin.permissions import AdminRole
from app.core.rbac import Role
from app.core.security import hash_password
from app.db.session import SessionRW
from app.models.user import User

# Simple local dev login: username "dev", password "dev".
DEV_EMAIL = "dev"
DEV_PASSWORD = "dev"  # noqa: S105  local dev only


async def _ensure_user(session, *, email: str, password: str, full_name: str) -> User:
    existing = (
        await session.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if existing:
        # Keep the password in sync so it always works locally.
        existing.hashed_password = hash_password(password)
        existing.is_active = True
        # Also grant full /admin access so dev/dev works on the admin panel.
        existing.admin_role = AdminRole.SUPER_ADMIN.value
        print(f"seed: user {email!r} already exists (password reset)")
        return existing
    user = User(
        email=email,
        full_name=full_name,
        hashed_password=hash_password(password),
        role=Role.owner.value,
        admin_role=AdminRole.SUPER_ADMIN.value,
        is_active=True,
        is_verified=True,
    )
    session.add(user)
    await session.flush()
    print(f"seed: created {email} / {password}")
    return user


async def run() -> None:
    async with SessionRW() as session:
        await _ensure_user(
            session, email=DEV_EMAIL, password=DEV_PASSWORD, full_name="Developer"
        )
        await session.commit()


if __name__ == "__main__":
    asyncio.run(run())
