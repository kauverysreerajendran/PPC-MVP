"""Test fixtures. Integration/API tests use a throwaway Postgres via testcontainers;
unit tests need none. Redis calls are monkeypatched to a fake in unit scope."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Iterator

import pytest
import pytest_asyncio


@pytest.fixture(scope="session")
def event_loop() -> Iterator[asyncio.AbstractEventLoop]:
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def _pg_url() -> Iterator[str]:
    from testcontainers.postgres import PostgresContainer

    with PostgresContainer("postgres:16-alpine", driver="asyncpg") as pg:
        yield pg.get_connection_url()


@pytest_asyncio.fixture()
async def db(_pg_url: str, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator:
    monkeypatch.setenv("DATABASE_URL", _pg_url)
    from app.db.base import Base
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    engine = create_async_engine(_pg_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(autouse=True)
def _fake_redis(monkeypatch: pytest.MonkeyPatch) -> None:
    try:
        import fakeredis.aioredis  # type: ignore
    except ImportError:
        return
    from app.infra import redis as redis_infra

    monkeypatch.setattr(redis_infra, "client", fakeredis.aioredis.FakeRedis(decode_responses=True))
