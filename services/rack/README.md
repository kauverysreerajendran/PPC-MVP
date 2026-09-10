# Rack Service

A standalone microservice (BLUEPRINT §0). It owns the **`rack`** database and is
reachable only through the gateway at **`/api/v1/rack`**. It never imports, and is
never imported by, the monolith or any other service. When it needs master data
(e.g. to check a `model_no`) it calls the **Masterdata API** — never its database.

## Endpoints

Swagger: `/api/v1/rack/docs` · OpenAPI: `/api/v1/rack/openapi.json`
Health: `/api/v1/rack/health` (and `/healthz`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/rack/slots` | list — `page`, `page_size`, `search`, `sort`, `direction`, `status`, `rack_code`, `occupied`, `occupied_by_model` |
| `POST` | `/api/v1/rack/slots` | create a physical slot |
| `GET` | `/api/v1/rack/slots/{id}` | retrieve |
| `PUT` | `/api/v1/rack/slots/{id}` | update |
| `DELETE` | `/api/v1/rack/slots/{id}` | soft delete (`status` → `inactive`) |
| `POST` | `/api/v1/rack/slots/{id}/occupy` | dynamically place a model in the slot (`occupied_by_model`, optional `date_of_occupied`) |
| `POST` | `/api/v1/rack/slots/{id}/release` | free the slot |

## Database (`rack`)

One table, **`rack`** — one physical slot per `(rack_code, row_no, column_no,
shelf_no)` (unique) plus its live occupancy:

| Column | Notes |
|---|---|
| `rack_code`, `row_no`, `column_no`, `shelf_no` | slot identity; `uq_rack_slot` composite unique; each `>= 1` |
| `location_name` | human label from the physical chart, e.g. `KL 1` |
| `occupied` | boolean, default `false` |
| `occupied_by_model` | `model_no` (a Masterdata business identifier); required when `occupied` |
| `date_of_occupied` | timestamptz, stamped on `occupy` |
| `notes` | free text |
| `status`, `created_at`, `updated_at` | audit; soft delete only |

Check constraint `ck_rack_occupied_requires_model` keeps an occupied slot from
losing its model. Indexes: `rack_code`, `occupied`, `occupied_by_model`,
`date_of_occupied`.

Browse it: `/rack-admin` (SQLAdmin). Open on localhost in `development`;
elsewhere prompts for `RACK_ADMIN_PASSWORD`.

## Local run (native, no Docker)

```bash
# 1. one-time: create the database
psql -h localhost -U postgres -c "CREATE DATABASE rack OWNER acme"

# 2. migrate (schema 0001 + real RACK-K chart seed 0002)
cd services/rack
alembic upgrade head

# 3. run (reads repo-root .env for RACK_DATABASE_URL + SECRET_KEY)
python -m app.main            # -> http://localhost:8003/api/v1/rack/docs
```

## Seed data

`alembic upgrade head` loads migration `0002_seed_rack_k_chart` — the real
occupied slots from the shop-floor **RACK-K** chart (KL / KR faces, 58 rows).
Idempotent and reversible. The distinct model numbers from that chart are
registered in the Masterdata service by its own migration
`0002_seed_rack_k_models`.

## Cross-service model check (opt-in)

Set `RACK_VALIDATE_MODEL=true` to have `occupy` / create verify `occupied_by_model`
against the Masterdata REST API (`RACK_MASTERDATA_API_BASE_URL`). A network
failure is non-blocking — Rack stays available if Masterdata is down.

## Tests

```bash
cd services/rack
pytest                        # contract/wiring tests (no DB)
```
