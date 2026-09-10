"""Create (or promote) the initial admin user.

    python -m app.admin.create_superuser

Credentials are never hardcoded. They come from, in order of precedence:
  1. environment variables  ADMIN_EMAIL / ADMIN_PASSWORD  (for automation)
  2. interactive prompt (password via getpass, entered twice)

The created user gets `admin_role = super_admin`. Running it again for an
existing email promotes that user and (optionally) resets the password.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from getpass import getpass

from app.admin.permissions import AdminRole
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionRW, dispose_engines
from app.models.user import User
from app.repositories.user import UserRepository

MIN_PASSWORD_LEN = settings.PASSWORD_MIN_LENGTH


def _prompt_email() -> str:
    email = os.getenv("ADMIN_EMAIL") or input("Admin email: ").strip()
    if "@" not in email:
        sys.exit("error: invalid email")
    return email.lower()


def _prompt_password() -> str:
    env_pw = os.getenv("ADMIN_PASSWORD")
    if env_pw:
        pw = env_pw
    else:
        pw = getpass("Admin password: ")
        if pw != getpass("Confirm password: "):
            sys.exit("error: passwords do not match")
    if len(pw) < MIN_PASSWORD_LEN:
        sys.exit(f"error: password must be at least {MIN_PASSWORD_LEN} characters")
    return pw


async def _run(role: AdminRole, reset_password: bool) -> None:
    email = _prompt_email()
    async with SessionRW() as session:
        repo = UserRepository(session)
        user = await repo.get_by_email(email)

        if user is None:
            password = _prompt_password()
            user = User(
                email=email,
                full_name="Administrator",
                hashed_password=hash_password(password),
                role="owner",
                admin_role=role.value,
                is_active=True,
                is_verified=True,
            )
            session.add(user)
            action = "created"
        else:
            user.admin_role = role.value
            user.is_active = True
            action = "promoted"
            if reset_password:
                user.hashed_password = hash_password(_prompt_password())
                action = "promoted + password reset"

        await session.commit()
        print(f"OK: {email} {action} as {role.value}")

    await dispose_engines()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or promote an admin user")
    parser.add_argument(
        "--role",
        choices=AdminRole.values(),
        default=AdminRole.SUPER_ADMIN.value,
        help="admin tier to grant (default: super_admin)",
    )
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="also reset the password if the user already exists",
    )
    args = parser.parse_args()
    asyncio.run(_run(AdminRole(args.role), args.reset_password))


if __name__ == "__main__":
    main()
