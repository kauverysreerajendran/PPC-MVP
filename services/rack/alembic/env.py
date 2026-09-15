from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import settings
from app.models import SCHEMA, Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", str(settings.RACK_DATABASE_URL))
target_metadata = Base.metadata

# This service shares one PostgreSQL database with the other services; its
# tables (and its own `alembic_version` row) live in the `SCHEMA` schema so
# they never collide with another service's tables.


def _run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema=SCHEMA,
        include_schemas=True,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_offline() -> None:
    context.configure(
        url=str(settings.RACK_DATABASE_URL),
        target_metadata=target_metadata,
        version_table_schema=SCHEMA,
        include_schemas=True,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        # The migration scripts' own `op.create_table(...)` calls are
        # unqualified (no `schema=`), so they resolve against the
        # connection's default schema. Set that at the physical-connection
        # level (not via a `SET search_path` issued through this engine —
        # that executes inside alembic's own migration transaction and gets
        # silently rolled back with it) so unqualified DDL lands in `SCHEMA`
        # instead of `public`, alongside every other service's tables.
        connect_args={"server_settings": {"search_path": f"{SCHEMA},public"}},
    )
    # Own connection + explicit commit: `CREATE SCHEMA` must land before the
    # migration transaction below opens, and — since this runs on a plain
    # NullPool connection — it is otherwise silently rolled back when that
    # connection closes without ever being committed.
    async with connectable.connect() as schema_connection:
        await schema_connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"'))
        await schema_connection.commit()
    async with connectable.connect() as connection:
        await connection.run_sync(_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
