"""Async engine + session factory for `sap_db` — this service's private database."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(
    str(settings.SAP_DATABASE_URL),
    pool_size=settings.SAP_DB_POOL_SIZE,
    max_overflow=settings.SAP_DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    pool_recycle=settings.SAP_DB_POOL_RECYCLE_SECONDS,
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
