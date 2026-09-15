# Database Optimization Standard

PostgreSQL assumed. The principles apply to any relational database.

## 1. Schema rules

| # | Rule |
|---|---|
| 1.1 | Every table has a primary key. Composite keys only where the domain requires them |
| 1.2 | Foreign keys are declared with explicit `ON DELETE` behaviour. Referential integrity is enforced by the database, not only by application code |
| 1.3 | Use the narrowest correct data type. `integer` over `bigint` where the range allows, `numeric` for money, `timestamptz` for all timestamps |
| 1.4 | Never store money in `float` or `double` |
| 1.5 | All timestamps stored in UTC. Conversion happens at the presentation layer |
| 1.6 | `NOT NULL` is the default. Nullable columns require a reason |
| 1.7 | Business rules that can be expressed as constraints are expressed as constraints: unique, check, exclusion |
| 1.8 | Audit columns on every business table: `created_at`, `updated_at`, `created_by`, `updated_by` |
| 1.9 | Soft delete uses `is_deleted` plus `deleted_at`. A partial index excludes deleted rows from the common queries |
| 1.10 | JSONB is used for genuinely variable attributes only. It is not a substitute for schema design |

## 2. Indexing

| # | Rule |
|---|---|
| 2.1 | Index every foreign key. PostgreSQL does not create these automatically |
| 2.2 | Index columns used in `WHERE`, `JOIN`, and `ORDER BY` on frequently executed queries |
| 2.3 | Composite index column order follows selectivity and query shape. Equality columns first, range column last |
| 2.4 | Partial indexes for queries that always filter on a flag, for example `WHERE is_deleted = false` |
| 2.5 | Use `CREATE INDEX CONCURRENTLY` on populated tables in production |
| 2.6 | Remove unused indexes. Check `pg_stat_user_indexes` quarterly |

Indexes are not free. Each one slows inserts and updates and consumes storage. A table with fifteen indexes on a high write path is a design problem.

## 3. Query patterns

| Problem | Fix |
|---|---|
| N+1 queries | `select_related` for foreign keys, `prefetch_related` for reverse and many to many |
| Counting large filtered sets | Cache the count, use an estimate, or drop the total from the response |
| `OFFSET` on deep pages | Keyset pagination on an indexed, ordered column |
| `LIKE '%term%'` | Trigram index with `pg_trgm`, or full text search with `tsvector` |
| Loading a whole table to filter in Python | Push the filter into the query |
| Repeated identical queries in one request | Fetch once and reuse, or cache |
| `DISTINCT` used to hide a wrong join | Correct the join |

## 4. Diagnosis

1. Enable `pg_stat_statements` and review the top queries by total time weekly.
2. Set `log_min_duration_statement` to 500 ms in production and monitor the slow query log.
3. Use `EXPLAIN (ANALYZE, BUFFERS)` on any query above the threshold. Look for sequential scans on large tables, high row estimate mismatches, and nested loops over large sets.
4. Track database size growth, index bloat, table bloat, and cache hit ratio. A cache hit ratio below 99 percent on an OLTP workload indicates insufficient `shared_buffers` or a query reading too much data.

## 5. Migration safety

| Operation | Risk | Safe approach |
|---|---|---|
| Add nullable column | Low | Direct |
| Add column with default | Blocking on older versions | Add nullable, backfill in batches, then set default |
| Add `NOT NULL` to existing column | Table scan and lock | Add check constraint as `NOT VALID`, validate, then convert |
| Create index | Write lock | `CREATE INDEX CONCURRENTLY` |
| Rename column | Breaks running application | Add new column, dual write, migrate reads, drop old in a later release |
| Drop column | Breaks older running instances | Stop writing first, drop one release later |
| Change column type | Table rewrite | New column plus backfill |
| Large backfill | Long transaction and lock contention | Batch with a bounded loop and a sleep between batches |

Rules:

1. Migrations are reviewed as carefully as application code.
2. Every migration is tested against a restored copy of production before release.
3. A migration and the code depending on it are deployed in separate steps when the change is not backward compatible.
4. Data migrations that run for more than a few seconds run as a managed job, not inside the deployment step.

## 6. Data growth and retention

1. Identify high growth tables early: logs, audit trails, notifications, job history, tracking events.
2. Define retention per table and implement an archival job. Unbounded growth is a slow moving production incident.
3. Consider native partitioning by date for tables expected to exceed roughly 50 million rows.
4. Archive to a separate table or cold storage rather than deleting where audit requirements apply.

## 7. Operations

| # | Item |
|---|---|
| 7.1 | Automated daily backups with encryption |
| 7.2 | Restore tested at least quarterly. An untested backup is not a backup |
| 7.3 | Point in time recovery configured where the business requires it |
| 7.4 | Autovacuum monitored and tuned for high update tables |
| 7.5 | Connection pooling through PgBouncer where connection count approaches the limit |
| 7.6 | Read replica used for reporting once report load affects transactional performance |
| 7.7 | Alerts on connection saturation, replication lag, disk usage, and long running transactions |
