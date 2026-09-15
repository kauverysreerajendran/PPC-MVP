# Rack Service

A standalone microservice (BLUEPRINT §0). It owns the **`rack`** schema inside the
single shared PostgreSQL database and is reachable only through the gateway at
**`/api/v1/rack`**. It never imports, and is never imported by, the monolith or
any other service. When it needs master data (e.g. to check a `model_no`) it
calls the **Masterdata API** — never its tables directly.

## Model: topology master → derived tray slots

The physical hierarchy is **Warehouse → Aisle → Rack → Shelf → Row → Tray**, and
none of it is fixed in code:

1. **`rack_master`** is the topology master — one row per physical rack, carrying
   its `shelf_count` / `row_count` / `tray_count`, its `position` along the aisle
   and which `side` it faces. Upload / maintain a rack here first.
2. **`rack`** holds one row per *tray slot*, materialised from a master row. The
   service derives shelf → row → tray, occupancy roll-ups, percentages and the
   Locate Me ranking (`app/topology.py`); the frontend only renders them.

Change a master's `shelf_count` (etc.) and re-materialise, and the slot table —
and every view built on it — follows.

## Endpoints

Swagger: `/api/v1/rack/docs` · OpenAPI: `/api/v1/rack/openapi.json`
Health: `/api/v1/rack/health` (and `/healthz`)

### Topology master

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/rack/masters` | list — `page`, `page_size`, `search`, `sort`, `direction`, `status`, `warehouse_code`, `aisle_code`, `rack_code` |
| `POST` | `/api/v1/rack/masters` | register a rack (`?materialize=true` derives its tray slots straight away) |
| `GET` / `PUT` / `DELETE` | `/api/v1/rack/masters/{id}` | retrieve / update (re-materialises) / soft delete |
| `POST` | `/api/v1/rack/masters/{id}/materialize` | (re)derive one rack's tray slots |
| `POST` | `/api/v1/rack/masters/materialize` | (re)derive every active rack |

### Derived views (what the Rack Locator renders)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/rack/topology` | warehouse → aisle → rack tree with occupancy; filter by `warehouse_code`, `aisle_code` |
| `GET` | `/api/v1/rack/racks/{rack_code}` | one rack → shelf → row → tray (`warehouse_code`, `aisle_code` required) |
| `GET` | `/api/v1/rack/locate` | backend-ranked empty trays; `warehouse_code`, `aisle_code`, `rack_code`, `limit` |
| `GET` | `/api/v1/rack/resolve` | `q=K-S4-R2-T05` (or a `model_no`) → the exact slot |

### Tray slots

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/rack/slots` | list — adds `warehouse_code`, `aisle_code`, `slot_state` filters |
| `POST` | `/api/v1/rack/slots` | create a physical slot |
| `GET` / `PUT` / `DELETE` | `/api/v1/rack/slots/{id}` | retrieve / update / soft delete |
| `POST` | `/api/v1/rack/slots/{id}/occupy` | place a model in the slot (`occupied_by_model`, optional `date_of_occupied`) |
| `POST` | `/api/v1/rack/slots/{id}/release` | free the slot |
| `POST` | `/api/v1/rack/slots/{id}/state` | reserve / block a free slot (or return it to `empty`) |

### Search & SAP-outward allocation

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/rack/find` | every tray a `model_no` / `lot_no` / SAP ref currently occupies, with per-tray qty |
| `POST` | `/api/v1/rack/allocate` | pull SAP outward lines from Masterdata and place each lot into random empty trays |

## Database (schema `rack`, in the shared database)

**`rack_master`** — `(warehouse_code, aisle_code, rack_code)` unique; the shape
columns `shelf_count` / `row_count` / `tray_count` (each 1–40 / 1–40 / 1–100),
plus `position`, `side`, names, audit, soft delete.

**`rack`** — one physical tray per `(warehouse_code, aisle_code, rack_code,
shelf_no, row_no, tray_no)` (unique, `uq_rack_slot`):

| Column | Notes |
|---|---|
| `warehouse_code` … `tray_no` | slot identity; each number `>= 1` |
| `location_name` | human label, e.g. `KL 1` / the location code |
| `slot_state` | `empty` \| `occupied` \| `reserved` \| `blocked` |
| `occupied` / `occupied_by_model` / `date_of_occupied` | live occupancy; model required when occupied |
| `qty` | this tray's slice of the lot (a lot is split across many trays) |
| `lot_no` / `sap_reference_id` | trace the tray to its SAP outward document; also the allocator's idempotency key |
| `notes`, `status`, `created_at`, `updated_at` | free text; audit; soft delete only |

Check constraints keep `slot_state` and `occupied` from disagreeing and keep an
occupied slot from losing its model.

Browse it: **`/rack-admin`** (SQLAdmin) — "Rack Masters" and "Rack Slots". Open on
localhost in `development`; elsewhere prompts for `RACK_ADMIN_PASSWORD`.

### Storing SAP outward stock into trays

`POST /api/v1/rack/allocate` reads the SAP outward feed from the **Masterdata**
API (`GET /api/v1/masterdata/sap-outwards` — never that DB, BLUEPRINT §12) and,
for every line not already placed:

* occupies `no_of_trays` **random** empty trays spread across many racks/aisles;
* `front_case_trays` land in the front rows, `back_case_trays` in the back rows;
* splits `quantity` across those trays into `rack.qty`;
* stamps `occupied_by_model`, `lot_no`, `sap_reference_id`.

Body: `{ warehouse_code?, aisle_code?, reset?, dry_run?, seed? }`. Idempotent per
`sap_reference_id`; `reset: true` frees every previously-allocated tray first
(hand-seeded RACK-K stock is untouched). Set `RACK_AUTO_ALLOCATE=true` to run it
once on startup (best-effort).

```bash
curl -X POST localhost:8003/api/v1/rack/allocate -H 'Authorization: Bearer <jwt>' \
     -H 'content-type: application/json' -d '{"reset": true, "seed": 7}'
```

## Local run (native, no Docker)

```bash
# 1. one-time: the shared database already exists (repo-root `.env`'s
#    POSTGRES_DB, e.g. `acme`) — nothing to create here. `alembic upgrade
#    head` creates the `rack` schema inside it on first run.

# 2. migrate (0001 schema · 0002 RACK-K chart · 0003 topology master + tray
#    slots · 0004 tray-level qty / lot_no / sap_reference_id)
cd services/rack
alembic upgrade head

# 3. run (reads repo-root .env for RACK_DATABASE_URL + SECRET_KEY)
python -m app.main            # -> http://localhost:8003/api/v1/rack/docs
#                                -> http://localhost:8003/rack-admin
```

## Seed data

`alembic upgrade head` applies:

* `0002_seed_rack_k_chart` — the real occupied slots from the shop-floor
  **RACK-K** chart (58 rows).
* `0003_rack_topology_master` — remaps those onto shelf/row/tray coordinates and
  seeds the **CBFC** warehouse: aisle **R** (14 racks, e.g. K = 6×4×15) and aisle
  **A** (6 racks of a different shape), then materialises every tray slot
  (~5,000). Only rack K carries occupancy; every other tray starts empty.

The distinct model numbers from the RACK-K chart are registered in the Masterdata
service by its own migration `0002_seed_rack_k_models`.

## Cross-service model check (opt-in)

Set `RACK_VALIDATE_MODEL=true` to have `occupy` / create verify `occupied_by_model`
against the Masterdata REST API (`RACK_MASTERDATA_API_BASE_URL`). A network
failure is non-blocking — Rack stays available if Masterdata is down.

## Tests

```bash
cd services/rack
pytest                        # contract/wiring tests (no DB)
```
