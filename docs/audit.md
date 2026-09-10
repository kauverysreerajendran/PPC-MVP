# Final architecture audit

Status of every item in the brief's section 25. `code` = implemented in this repo;
`hook` = deliberate seam left for the next increment (documented, not stubbed-in-a-misleading-way).

| # | Item | Status | Where |
|---|------|--------|-------|
| 1 | Next.js production config | code | `frontend/next.config.ts` (`output: standalone`, headers, no `x-powered-by`) |
| 2 | TypeScript strict mode | code | `frontend/tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| 3 | FastAPI modular architecture | code | `backend/app/{api,services,repositories,models,schemas}` |
| 4 | API versioning | code | `/api/v1` prefix, `app/api/v1/router.py` |
| 5 | PostgreSQL | code | `docker-compose*.yml`, `app/db/session.py` |
| 6 | SQLAlchemy | code | 2.0 async, `app/models/*` |
| 7 | Alembic | code | `backend/alembic/`, `versions/0001_initial.py` |
| 8 | Redis | code | `app/infra/redis.py` (cache, locks, rate-limit, broker) |
| 9 | Celery | code | `app/workers/` (worker + beat + DLQ + retry) |
| 10 | Nginx | code | `infrastructure/nginx/` (dev + prod, TLS, headers, LB) |
| 11 | Docker | code | multi-stage `backend/Dockerfile`, `frontend/Dockerfile`, non-root, healthchecks |
| 12 | Docker Compose | code | `docker-compose.yml` + `docker-compose.prod.yml` |
| 13 | Environment config | code | `app/core/config.py` (Pydantic Settings, fail-fast), `.env.example` |
| 14 | Authentication | code | `app/services/auth/service.py`, `app/core/security.py` (Argon2 + JWT + rotating refresh) |
| 15 | Authorization foundation | code | `app/core/rbac.py`, `require_role` / `require_permission` deps |
| 16 | Rate limiting | code | `app/middleware/rate_limit.py` (Redis token bucket) + Nginx `limit_req` |
| 17 | CORS | code | `app/middleware/setup.py` (explicit allowlist, prod-validated) |
| 18 | Security headers | code | `app/middleware/security_headers.py` + Nginx prod conf |
| 19 | Input validation | code | Pydantic schemas, `extra="forbid"` |
| 20 | Error handling | code | `app/core/exceptions.py` (global handlers, consistent schema, sanitized 500) |
| 21 | Request IDs | code | `app/middleware/request_context.py` (ULID, `X-Request-ID` echo) |
| 22 | Logging | code | `app/core/logging.py` (structlog JSON, redaction, context) |
| 23 | Metrics | code | `app/core/metrics.py`, `/api/v1/metrics` |
| 24 | Health / readiness / liveness | code | `app/api/v1/routes/health.py` (`/healthz`, `/readyz`, `/startupz`) |
| 25 | Unit tests | code | `backend/tests/unit`, `frontend/tests/*.test.ts` |
| 26 | Integration tests | code | `backend/tests/integration` (testcontainers Postgres) |
| 27 | API tests | code | `backend/tests/api` (httpx ASGI) |
| 28 | E2E tests | code | `frontend/e2e/auth.spec.ts` (Playwright) |
| 29 | CI/CD | code | `.github/workflows/ci.yml`, `cd.yml` |
| 30 | Dependency / security scanning | code | `pip-audit`, `npm audit`, Trivy, Dependabot |
| 31 | Database indexes | code | `alembic/versions/0001_initial.py`, model `__table_args__` |
| 32 | Connection pooling | code | `app/db/session.py` (`pool_size`, `max_overflow`, `pool_pre_ping`) |
| 33 | Cache strategy | code | `app/infra/cache.py` (cache-aside, jittered TTL, single-flight, fail-open) |
| 34 | Background jobs | code | `app/workers/tasks/*` |
| 35 | Retry strategy | code | `BaseTask` (exp backoff + jitter, capped), API client bounded retry |
| 36 | Idempotency | code | `Idempotency-Key` dep + task idempotency keys |
| 37 | Horizontal scaling | code | stateless tiers, shared state in PG/Redis, `deploy.replicas` |
| 38 | Graceful degradation | code | Redis-optional paths degrade; `/readyz` drains on hard-dep loss |
| 39 | Production Docker images | code | `runtime` / `runner` targets, slim base, non-root |
| 40 | Cloud deployment strategy | code | `docs/deployment.md` (Compose -> K8s), managed-service table |
| 41 | Backup / recovery | hook | `docs/database.md` (PITR, `pg_dump`+WAL, restore drill) — runbook to be added |
| 42 | Documentation | code | `docs/*.md` with Mermaid diagrams |
| 43 | Django-style DB admin (`/admin`) | code | `backend/app/admin/` (SQLAdmin): CRUD + search/filter/sort/paginate, FK nav, RBAC (super/admin/read-only), secrets excluded, `create_superuser`, Nginx `/admin` route — see `docs/admin.md` |

## Deliberate non-goals for the initial cut

- No microservices — modular monolith with clean seams (`services/<domain>`).
- No Kubernetes manifests in-repo yet — Compose is the container contract; a Helm chart is the
  documented next step.
- OpenTelemetry / Sentry are wired but inert until their env vars are set.
- Read replica wiring exists (`get_db_ro`, `DATABASE_RO_URL`) but points at the primary until a
  replica is provisioned.

## Verified locally in this environment

- `ruff check` + `ruff format --check`: clean.
- `pytest tests/unit`: 20 passed (incl. `test_admin_safety.py` — no secret column in any
  admin surface, read-only tier cannot write, anonymous has no access).
- `python -m app.scripts.export_openapi`: 14 API paths, schema written to `openapi.json`.
- `/admin` smoke (ASGI): `/admin/login` renders; `/admin/`, `/admin/{user,project,auditlog,session}/list`
  all 302 → `/admin/login` when unauthenticated; static assets serve.
- `python -m compileall app alembic tests`: clean.

Integration/API/E2E suites and frontend `tsc`/`vitest`/`build` run in CI (they need Docker /
`npm ci`, unavailable in this authoring sandbox).
