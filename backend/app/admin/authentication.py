"""Authentication backend for the /admin panel.

Reuses the application's user table and Argon2 password hashes. On successful
login the admin's id / role / email are stored in a signed session cookie
(Starlette SessionMiddleware, wired by SQLAdmin from `secret_key`). No new
credential store, no separate token type.
"""

from __future__ import annotations

from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request
from starlette.responses import RedirectResponse

from app.admin.permissions import (
    SESSION_EMAIL,
    SESSION_ROLE,
    SESSION_USER_ID,
    AdminRole,
)
from app.core.logging import get_logger
from app.core.security import verify_password
from app.db.session import SessionRW
from app.repositories.user import UserRepository

log = get_logger("app.admin.auth")


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        email = str(form.get("username", "")).strip().lower()
        password = str(form.get("password", ""))

        async with SessionRW() as session:
            user = await UserRepository(session).get_by_email(email)

        if user is None or not user.is_active or not user.admin_role:
            log.warning("admin_login_denied", email=email)
            return False
        try:
            role = AdminRole(user.admin_role)
        except ValueError:
            log.error("admin_login_bad_role", email=email, role=user.admin_role)
            return False
        if not verify_password(password, user.hashed_password):
            log.warning("admin_login_bad_password", email=email)
            return False

        request.session.update(
            {
                SESSION_USER_ID: str(user.id),
                SESSION_ROLE: role.value,
                SESSION_EMAIL: user.email,
            }
        )
        log.info("admin_login_ok", email=email, role=role.value)
        return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool | RedirectResponse:
        user_id = request.session.get(SESSION_USER_ID)
        raw_role = request.session.get(SESSION_ROLE)
        if not user_id or not raw_role:
            return RedirectResponse(request.url_for("admin:login"), status_code=302)

        # Re-check the user still exists, is active, and still has an admin role
        # (revocation takes effect on the next request, not just next login).
        async with SessionRW() as session:
            user = await UserRepository(session).get(int(user_id))
        if user is None or not user.is_active or user.admin_role != raw_role:
            request.session.clear()
            return RedirectResponse(request.url_for("admin:login"), status_code=302)
        return True
