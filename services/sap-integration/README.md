# SAP Integration Service

A standalone microservice (BLUEPRINT §0). It owns the **`sap_db`** database and is
reachable only through the gateway at **`/api/v1/sap`**. It never imports, and is
never imported by, the monolith or any other service.

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
| `POST /api/v1/sap/sync` | run a SAP pull (mock provider for the MVP) and upsert records |
| `GET  /api/v1/sap/sync-runs` | sync history |

## Database (`sap_db`)

| Table | Rows |
|---|---|
| `sap_inward_record` | the inward document line — SAP-sourced columns + `remark` (app-owned) + provenance (`source_system`, `sync_id`) |
| `sap_sync_run` | one row per sync attempt: status, records_ingested, error, timings |

The SAP provider is a **mock** until Titan confirms the real SAP interface
(OData / BAPI / RFC) — see `app/providers/`.

## Local run (native, no Docker)

```bash
# 1. one-time: create the database (uses the monolith's local Postgres role)
psql -h localhost -U acme -c "CREATE DATABASE sap_db;"

# 2. install deps (same interpreter is fine)
pip install -r services/sap-integration/requirements.txt

# 3. migrate
cd services/sap-integration
alembic upgrade head

# 4. run (reads repo-root .env for SAP_DATABASE_URL + SECRET_KEY)
python -m app.main            # -> http://localhost:8001/api/v1/sap/docs
```

The Next.js dev server proxies `/api/v1/sap/*` here via `SAP_PROXY_TARGET`
(`frontend/.env.local`).

## Tests

```bash
cd services/sap-integration
pytest                        # unit tests (no DB)
```
