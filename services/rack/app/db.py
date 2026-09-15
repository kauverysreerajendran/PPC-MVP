"""Async engine + session factory for the Rack service.

Connects to the single shared PostgreSQL database; all of this service's
tables live in the `rack` schema (see `app.models.SCHEMA`).
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(
    str(settings.RACK_DATABASE_URL),
    pool_size=settings.RACK_DB_POOL_SIZE,
    max_overflow=settings.RACK_DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    pool_recycle=settings.RACK_DB_POOL_RECYCLE_SECONDS,
    echo=False,
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """Request-scoped session. Commits on success, rolls back on error."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    await engine.dispose()
