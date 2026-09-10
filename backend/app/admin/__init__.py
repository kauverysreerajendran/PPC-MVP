"""Isolated Django-Admin-style panel for the FastAPI app (powered by SQLAdmin).

Mounted at /admin by `init_admin(app)`, called from `app.main`.
"""

from __future__ import annotations

from fastapi import FastAPI

from app.admin.config import ADMIN_BASE_URL, create_admin

__all__ = ["ADMIN_BASE_URL", "init_admin"]


def init_admin(app: FastAPI) -> None:
    create_admin(app)
