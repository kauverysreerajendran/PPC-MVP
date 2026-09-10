# API design

Base path: `/api/v1`. OpenAPI served at `/api/v1/openapi.json`, Swagger UI at `/api/v1/docs`,
ReDoc at `/api/v1/redoc`.

## Conventions

- Resources are plural nouns: `/projects`, `/users`.
- Verbs via HTTP methods. `POST` create, `GET` read, `PATCH` partial update, `PUT` replace,
  `DELETE` soft-delete.
- All mutating endpoints accept an optional `Idempotency-Key` header; the key + route + user is
  stored in Redis for 24h and replays the stored response.
- Every response carries `X-Request-ID` (echoed from the client if provided, else generated).

## Pagination

Offset pagination by default:

```
GET /api/v1/projects?page=1&size=20&sort=-created_at&filter[status]=active
```

Response envelope:

```json
{
  "data": [ ... ],
  "pagination": { "page": 1, "size": 20, "total": 137, "pages": 7 }
}
```

`sort` is a comma list; `-` prefix = descending; only whitelisted fields per resource.
`filter[field]=value` — whitelisted fields only, translated to parameterized SQL.

## Error schema

Consistent RFC-9457-style body for every 4xx/5xx:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": [ { "loc": ["body", "email"], "msg": "value is not a valid email" } ],
    "request_id": "01J...",
    "status": 422
  }
}
```

| HTTP | `code` examples |
|------|-----------------|
| 400 | `bad_request` |
| 401 | `invalid_credentials`, `token_expired`, `token_reused` |
| 403 | `forbidden`, `insufficient_role` |
| 404 | `not_found` |
| 409 | `conflict`, `already_exists` |
| 422 | `validation_error` |
| 429 | `rate_limited` (includes `Retry-After`) |
| 500 | `internal_error` (message is generic; details never leaked) |

## Typed frontend contract

CI runs `scripts/generate_openapi.py` -> `openapi.json`, then
`openapi-typescript` generates `frontend/src/lib/api/schema.d.ts`. The frontend API client is
typed against that file, so a breaking backend change fails the frontend typecheck.
