# Database

PostgreSQL 16. Async access via SQLAlchemy 2.0 + `asyncpg`.

## Conventions

- Every domain table inherits from `Base` mixins:
  - `id` — `BIGINT` identity PK (UUIDv7 optional per table for externally-exposed ids).
  - `created_at`, `updated_at` — `timestamptz`, DB-side defaults / `onupdate`.
  - `deleted_at` — nullable `timestamptz`; soft delete. Repositories filter `deleted_at IS NULL`
    unless `include_deleted=True`.
- Audit trail: `audit_log` table (actor, action, entity, entity_id, diff JSONB, request_id, ts).
- All FKs `ON DELETE RESTRICT` for domain data; child cleanup is explicit in services.
- Naming convention set in `Base.metadata` so Alembic autogenerate produces stable names.

## Indexes (initial)

| Table | Index |
|-------|-------|
| `users` | `UNIQUE(lower(email))`, `INDEX(created_at)` |
| `refresh_tokens` | `UNIQUE(token_hash)`, `INDEX(family_id)`, `INDEX(user_id, expires_at)` |
| `projects` | `INDEX(owner_id, created_at)`, partial `INDEX(status) WHERE deleted_at IS NULL` |
| `audit_log` | `INDEX(entity, entity_id)`, `INDEX(created_at)` |

## Constraints

- `users.email` CITEXT-style uniqueness via functional unique index.
- `CHECK (size > 0)` style checks live on the models via `__table_args__`.
- `refresh_tokens.expires_at > created_at` check constraint.

## Connection pooling

`create_async_engine(dsn, pool_size=10, max_overflow=20, pool_pre_ping=True,
pool_recycle=1800)`. Pool sized per replica so `replicas * (pool_size+max_overflow) <
max_connections - reserve`. Use PgBouncer (transaction mode) in production between app and DB.

## Read replicas

`app/db/session.py` exposes two engines:

```python
engine_rw  = create_async_engine(settings.DATABASE_URL, ...)
engine_ro  = create_async_engine(settings.DATABASE_RO_URL or settings.DATABASE_URL, ...)
```

`get_db()` yields a writer session; `get_db_ro()` yields a reader session. Services pick the
reader for pure queries. Switching to a real replica = set `DATABASE_RO_URL`. No code change.

## Migrations

```bash
make migration m="add projects table"   # alembic revision --autogenerate
make migrate                            # alembic upgrade head
make downgrade                          # alembic downgrade -1
```

Rules: migrations are **expand/contract** (add nullable col + backfill task + later enforce),
reviewed in PRs, validated in CI (`alembic upgrade head` then `alembic check` against models).

## Backup / recovery

- Managed Postgres: PITR + automated daily snapshots, 30-day retention.
- Self-managed: `pg_dump` nightly to object storage + WAL archiving (`wal-g`).
- Restore drill quarterly; RPO 5 min (WAL), RTO 1h documented in the runbook.
