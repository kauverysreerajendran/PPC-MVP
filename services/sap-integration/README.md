# SAP Integration Service

A standalone microservice (BLUEPRINT §0). It owns the **`sap`** schema inside the
single shared PostgreSQL database and is reachable only through the gateway at
**`/api/v1/sap`**. It never imports, and is never imported by, the monolith or
any other service.

## What it does

**Browse the database in a browser:** `/sap-admin` (SQLAdmin). Native dev:
<http://localhost:8001/sap-admin>. Open on localhost in `development`; any other
environment prompts for `SAP_ADMIN_PASSWORD` (default `sap-admin`). Swagger for
the API is at `/api/v1/sap/docs`.

| Endpoint | Purpose |
|---|---|
| `GET  /api/v1/sap/records` | paginated SAP inward document lines (feeds the SAP Upload table) |
| `PATCH /api/v1/sap/records/{id}` | update the one application-owned field: `remark` |
| `GET  /api/v1/sap/enums` | DB-driven column defs + movement types (keeps the UI dynamic) |
| `POST /api/v1/sap/sync` | run a SAP pull (mock provider for the MVP) and upsert records — also driven by the **Sync from SAP** button on the SAP Outward screen |
| `GET  /api/v1/sap/sync-runs` | sync history |

## Database (schema `sap`, in the shared database)

| Table | Rows |
|---|---|
| `sap_inward_record` | the inward document line — SAP-sourced columns + `remark` (app-owned) + provenance (`source_system`, `sync_id`) |
| `sap_sync_run` | one row per sync attempt: status, records_ingested, error, timings |

The SAP provider is a **mock** until Titan confirms the real SAP interface
(OData / BAPI / RFC) — see `app/providers/`.

## How data gets in

Three entry points, one code path — provider (or seed list) → DTOs →
`SapRepository.upsert_records`, keyed on `sap_reference_id`. Nothing can create
a duplicate line, and the one application-owned column (`remark`) is never
overwritten.

| Entry point | When |
|---|---|
| `python -m app.seed` | the MVP's fixed 20 lines (`SAP-MVP-001` … `-020`); re-running refreshes them in place |
| automatic pull (`app/sync_loop.py`) | every `SAP_AUTO_SYNC_SECONDS` while the service is up |
| `POST /api/v1/sap/sync` | on demand — the **Sync from SAP** button |

The automatic pull takes a Postgres transaction-level advisory lock per tick, so
with several workers or replicas exactly one pulls and the rest skip. A failed
pull is recorded as a `FAILED` row in `sap_sync_run` and logged; it never stops
the loop or the service.

The frontend subscribes to nothing: it polls `/records` on the shared
transactional cadence (`frontend/src/lib/polling.ts`), so anything written to
`sap.sap_inward_record` — by a pull, by the seed, or by hand in psql — appears
on the next tick, on refetch-on-focus, or after a mutation invalidates the
query.

| Setting | Default | Meaning |
|---|---|---|
| `SAP_AUTO_SYNC_ENABLED` | `true` | run the background pull at all |
| `SAP_AUTO_SYNC_SECONDS` | `300` | seconds between pulls |
| `SAP_AUTO_SYNC_COUNT` | `20` | lines requested per pull |
| `SAP_AUTO_SYNC_START_DELAY_SECONDS` | `15` | wait before the first pull |

### Replacing the mock with real SAP

Add a provider class in `app/providers/` implementing
`SapProvider.fetch_inward_records`, return `SapRecordDTO`s, and register it in
`get_provider()`. Nothing else changes: the service, the API contract, the
schema, the auto-pull and the frontend are all provider-agnostic. Drop
`python -m app.seed` from the setup steps at that point — the seeded rows are
overwritten by the first real pull that carries the same reference ids, and
otherwise simply age out.

## Local run (native, no Docker)

```bash
# 1. one-time: the shared database already exists (repo-root `.env`'s
#    POSTGRES_DB, e.g. `acme`) — nothing to create here. `alembic upgrade
#    head` creates the `sap` schema inside it on first run.

# 2. install deps (same interpreter is fine)
pip install -r services/sap-integration/requirements.txt

# 3. migrate
cd services/sap-integration
alembic upgrade head

# 4. seed the MVP's 20 static inward lines (idempotent — safe to re-run)
python -m app.seed

# 5. run (reads repo-root .env for SAP_DATABASE_URL + SECRET_KEY)
python -m app.main            # -> http://localhost:8001/api/v1/sap/docs
```

The Next.js dev server proxies `/api/v1/sap/*` here via `SAP_PROXY_TARGET`
(`frontend/.env.local`).

## Tests

```bash
cd services/sap-integration
pytest                        # unit tests (no DB)
```
