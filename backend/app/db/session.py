"""Async engines + session factories. Writer and reader are separate so a read
replica can be introduced by setting DATABASE_RO_URL — no code change."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

_engine_kwargs = {
    "pool_size": settings.DB_POOL_SIZE,
    "max_overflow": settings.DB_MAX_OVERFLOW,
    "pool_pre_ping": True,
    "pool_recycle": settings.DB_POOL_RECYCLE_SECONDS,
    "echo": False,
}

engine_rw = create_async_engine(str(settings.DATABASE_URL), **_engine_kwargs)
engine_ro = create_async_engine(settings.database_ro_url, **_engine_kwargs)

SessionRW = async_sessionmaker(engine_rw, expire_on_commit=False, autoflush=False)
SessionRO = async_sessionmaker(engine_ro, expire_on_commit=False, autoflush=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Writer session. Commits on success, rolls back on exception."""
    async with SessionRW() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_db_ro() -> AsyncIterator[AsyncSession]:
    """Read-only session for pure queries. Never commits."""
    async with SessionRO() as session:
        yield session


async def dispose_engines() -> None:
    await engine_rw.dispose()
    await engine_ro.dispose()
