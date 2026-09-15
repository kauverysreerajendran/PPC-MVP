# Backend Architecture Standard

Applies to Django and FastAPI services with PostgreSQL.

## 1. Layering

| Layer | Django | FastAPI | Responsibility |
|---|---|---|---|
| Transport | View or ViewSet | Router endpoint | Parse request, call service, return response |
| Validation | Serializer | Pydantic schema | Shape and type checking, field rules |
| Service | `services.py` | `services.py` | Business rules, orchestration, transactions |
| Data access | Manager or queryset methods | Repository module | Query construction, no business rules |
| Model | Django ORM model | SQLAlchemy model | Schema, constraints, computed properties |

Rules:

1. A view contains no business rule and no more than one service call plus response construction.
2. A service does not import request or response objects. It receives plain data and returns plain data.
3. Query logic lives in managers or repositories so that the same query is not rewritten in three places with three different filters.

## 2. Folder structure

```
app/
  api/
    v1/
      invoices/
        routes.py
        schemas.py
  services/
    invoice_service.py
  repositories/
    invoice_repository.py
  models/
  core/
    config.py
    security.py
    exceptions.py
    logging.py
    pagination.py
  tasks/           Background jobs
  migrations/
  tests/
```

## 3. API contract

1. Versioned base path: `/api/v1/`. Breaking changes go to a new version, never into the existing one.
2. Resource naming is plural and lowercase: `/api/v1/invoices/`, `/api/v1/invoices/{id}/`.
3. Verbs are not used in paths. The HTTP method carries the action. An exception is allowed for genuine non CRUD operations such as `/invoices/{id}/approve/`.
4. Field naming is consistent across the whole API. Pick `snake_case` or `camelCase` once and hold to it.

### 3.1 Status codes

| Code | Used for |
|---|---|
| 200 | Successful read or update |
| 201 | Resource created |
| 204 | Successful delete with no body |
| 400 | Validation failure |
| 401 | Missing or invalid authentication |
| 403 | Authenticated but not permitted |
| 404 | Resource does not exist or is not visible to this user |
| 409 | Conflict such as duplicate key or state conflict |
| 422 | Semantically invalid payload where the framework separates it from 400 |
| 429 | Rate limit exceeded |
| 500 | Unhandled server fault |

Returning 200 with an error message in the body is not acceptable. Clients cannot distinguish success from failure without parsing text.

### 3.2 Response shape

Success:

```json
{
  "data": { },
  "meta": { "page": 1, "page_size": 25, "total": 143 }
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid",
    "details": [{ "field": "email", "message": "Enter a valid email address" }],
    "trace_id": "b7f2c1e4-1c2a-4a0e-9d2f-2a1d8e4f6c11"
  }
}
```

`code` is a stable machine readable string. `message` is safe to show a user. `details` maps to form fields. `trace_id` links the response to the server log entry.

## 4. Pagination

1. Every collection endpoint is paginated. Default page size 25, maximum 100.
2. Offset pagination is acceptable up to roughly 10,000 rows. Beyond that, use keyset pagination on an indexed column.
3. The total count is returned only when the client needs it. `COUNT(*)` on large filtered tables is a common slow query source.

## 5. Transactions

1. A write operation that touches more than one table runs inside an explicit transaction.
2. External calls such as HTTP requests, email, and payment gateways are never made inside an open transaction. Commit first, then dispatch the side effect through a queue.
3. Long running work does not run in the request cycle. Anything above two seconds goes to Celery, RQ, or an equivalent worker.
4. Endpoints that create financial or state changing records accept an idempotency key where the client may retry.

## 6. Configuration

1. Configuration is read once into a typed settings object at startup. No `os.environ` lookups scattered across modules.
2. Settings are split per environment. Debug mode is never enabled outside local development.
3. Database credentials, signing keys, and third party secrets come from environment variables or a secret manager.
4. `.env.example` lists every variable with a description and a sample value.

## 7. Logging

| Level | Use |
|---|---|
| DEBUG | Local diagnostics only, disabled in production |
| INFO | Request completion, job start and finish, state transitions |
| WARNING | Recoverable problems such as a retry or a cache miss storm |
| ERROR | Failed operation affecting a user request |
| CRITICAL | Service level failure requiring immediate attention |

Every log line carries the trace ID, user ID where available, and the operation name. Logs are structured JSON in production. Passwords, tokens, card data, and full request payloads are never logged.

## 8. Background jobs

1. Jobs are idempotent. A job that runs twice produces the same result.
2. Every job has a retry policy with a bounded attempt count and exponential backoff.
3. Failed jobs land in a dead letter queue and raise an alert. Silent job failure is a production incident waiting to happen.
4. Scheduled jobs record their last successful run so that a missed schedule is detectable.

## 9. Testing expectations

| Test type | Target |
|---|---|
| Unit tests on services | Every business rule branch |
| API tests | Every endpoint, including 401, 403, and validation failure paths |
| Repository tests | Non trivial queries and filters |
| Migration check | Applies and rolls back on a copy of production schema |

Authorization tests are mandatory. An endpoint tested only with an admin user is an untested endpoint.
