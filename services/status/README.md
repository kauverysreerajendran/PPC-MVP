# Status Service

A standalone microservice (BLUEPRINT §0). It owns the **`status`** schema inside
the single shared PostgreSQL database and is reachable only through the gateway
at **`/api/v1/status`**.

It is the single source of truth for **where a SAP line is in the flow**. Other
services never store their own copy of a status: they report a change here and
every screen reads the current value back, so a status is derived the same way
everywhere.

## Stages and statuses

Statuses are data (`status_definition`, seeded by `0001_initial`), not code:

| Stage | Statuses (initial first) | Reported by |
|---|---|---|
| `outward` | `DISPATCHED` Dispatched → `RECEIVED` Received | Masterdata — first Box UID scan on SAP Inward |
| `inward` | `NOT_RECEIVED` Not received → `YET_TO_VERIFY` Yet to verify → `VERIFIED` Verified | Masterdata — scan / Verify / reset |
| `rack` | `NOT_PLACED` Not placed → `PARTIALLY_PLACED` Partially placed → `PLACED` Placed | Rack — placing received pieces into trays |

A line with no row for a stage is in that stage's initial status.

## Tables

* `status_definition` — allowed codes per stage with label, colour tone and order.
* `line_status` — current status: one row per `sap_reference_id` + `stage`.
* `status_event` — append-only history: code, previous code, note, actor, source, time.

## Endpoints

Swagger: `/api/v1/status/docs` · Health: `/api/v1/status/health` (and `/healthz`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/definitions?stage=` | the status master (labels / tones) |
| `POST` | `/events` | move one line to a status (no-op if already there) |
| `POST` | `/events/batch` | several changes in one transaction |
| `GET` | `/lines?stage=&code=&refs=` | current statuses, paged |
| `GET` | `/lines/by-ref/{sap_reference_id}` | every stage + full history of one line |
| `GET` | `/refs?stage=&code=` | all SAP references in one status (for filtering other lists) |

Callers authenticate with the shared HS256 access token. Services call it with a
short-lived token they mint from `SECRET_KEY` (see each service's
`status_client.py`).

## Run natively

```bash
cd services/status
alembic upgrade head          # creates the `status` schema + seeds definitions
python -m uvicorn app.main:app --host 127.0.0.1 --port 8004
```

Reads `STATUS_DATABASE_URL` and `SECRET_KEY` from the repo-root `.env`. The
frontend reaches it through `STATUS_PROXY_TARGET` (`next.config.ts`).
