# Masterdata Service

A standalone microservice (BLUEPRINT §0). It owns the **`masterdata`** database
and is reachable only through the gateway at **`/api/v1/masterdata`**. It never
imports, and is never imported by, the monolith or any other service. Other
services that need master data call this **API** — never the database.

## Endpoints

Swagger: `/api/v1/masterdata/docs` · OpenAPI: `/api/v1/masterdata/openapi.json`
Health: `/api/v1/masterdata/health` (and `/healthz`)

Every resource has the same REST surface:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/masterdata/{resource}` | list — `page`, `page_size`, `search`, `sort`, `direction`, `status` |
| `POST` | `/api/v1/masterdata/{resource}` | create |
| `GET` | `/api/v1/masterdata/{resource}/{id}` | retrieve |
| `PUT` | `/api/v1/masterdata/{resource}/{id}` | update |
| `DELETE` | `/api/v1/masterdata/{resource}/{id}` | soft delete (`status` → `inactive`) |

`{resource}` ∈ `models`, `plating-colors`, `vendors`, `locations`, `sap-inwards`.
Extra: `GET /locations/children?parent_location_id=` for the hierarchy;
`sap-inwards` also filters by `vendor_id`, `model_id`, `movement_type`.

## Database (`masterdata`)

| Table | Rows |
|---|---|
| `master_models` | model / model-number master (`model_no` unique) |
| `plating_colors` | plating & colour master (`color_code`, `color_name` unique) |
| `vendors` | vendor master (`vendor_code` unique) |
| `locations` | self-referencing hierarchy: `WAREHOUSE → RACK → ROW → SHELF → BIN` |
| `sap_inwards` | SAP inward document lines; FKs `model_id`, `vendor_id`, `plating_color_id`, `location_id` while keeping the raw SAP codes |

All tables carry `status` + `created_at` + `updated_at`. Soft delete only, so
`sap_inwards` foreign keys stay valid.

Browse it in a browser: `/masterdata-admin` (SQLAdmin). Open on localhost in
`development`; elsewhere prompts for `MASTERDATA_ADMIN_PASSWORD`.

## Local run (native, no Docker)

```bash
# 1. one-time: create the database
psql -h localhost -U postgres -c "CREATE DATABASE masterdata OWNER acme"

# 2. install deps (same interpreter as the monolith is fine)
pip install -r services/masterdata/requirements.txt

# 3. migrate
cd services/masterdata
alembic upgrade head

# 4. run (reads repo-root .env for MASTERDATA_DATABASE_URL + SECRET_KEY)
python -m app.main            # -> http://localhost:8002/api/v1/masterdata/docs
```

## Importing real master data

`python -m app.seed` pulls the **real** distinct vendors, models and inward
lines from the SAP Integration service over HTTP (`MASTERDATA_SAP_API_BASE_URL`)
and upserts them by natural key. It writes **no** sample/demo data — if the SAP
feed is empty it imports nothing. Set `MASTERDATA_SEED_TOKEN` to a gateway JWT
when the SAP service requires auth.

## Tests

```bash
cd services/masterdata
pytest                        # contract/wiring tests (no DB)
```
