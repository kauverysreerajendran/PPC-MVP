# Acme SaaS Platform

A production-ready, horizontally-scalable full-stack SaaS foundation.

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (App Router) + TypeScript strict |
| API | FastAPI (async) — modular monolith |
| Database | PostgreSQL 16 (+ read-replica ready) |
| Cache / rate limit / locks / broker | Redis 7 |
| Background jobs | Celery 5 (+ Beat) |
| Edge | Nginx (TLS, gzip/brotli, security headers, LB) |
| Packaging | Docker multi-stage + Compose (dev/prod) |
| CI/CD | GitHub Actions |
| Observability | structlog JSON, Prometheus metrics, OTel-ready, Sentry-ready |

## Quick start (native, no Docker — the usual dev loop)

The app is **six processes**: Next.js (:3000) proxies `/api/v1/*` to the
backend (:8000) and four microservices — sap-integration (:8001), masterdata
(:8002), rack (:8003), status (:8004). If any one of them is not running, every
browser call to it comes back from the Next proxy as a bare
`500 Internal Server Error`. Start them all with one command:

```bash
python dev.py            # (or double-click dev.cmd) starts whatever is not already running; Ctrl+C stops it
python dev.py --check    # who is up? (postgres + all six ports)
check.cmd                # typecheck + lint + every pytest suite → .dev\check.log
python dev.py --migrate  # alembic upgrade head in every service first
python dev.py --only backend,masterdata --no-frontend
```

Logs are prefixed per process; the script waits for each `/healthz` and prints
a status table. The frontend shows a red "Service not running" bar under the
header naming the exact process whenever a call is proxied to a dead port.

## Quick start (Docker)

```bash
cp .env.example .env
make up            # builds and starts the full stack
make migrate       # apply Alembic migrations
make seed          # optional demo data
open http://localhost            # Next.js via Nginx
open http://localhost/api/v1/docs  # Swagger UI

make superuser                   # create the first /admin user (interactive)
open http://localhost:8000/admin  # Django-style DB admin (SQLAdmin)
```

## Repository layout

See [docs/architecture.md](docs/architecture.md). Top level:

```
frontend/         Next.js app (feature-based)
backend/          FastAPI app (layered: router -> service -> repository -> db)
infrastructure/   nginx, redis, postgres, monitoring, scripts
docs/             architecture, api, database, security, deployment, observability, development
.github/workflows CI/CD pipelines
docker-compose*.yml
Makefile
```

## Core principles

- **Modular monolith first.** Clean domain boundaries (`app/services/<domain>`) that can be
  extracted into services later — no premature microservices.
- **No business logic in routers or React components.**
- **Stateless app tiers.** All shared state lives in PostgreSQL or Redis, so every tier scales
  horizontally with zero code changes.
- **Fail fast on config.** Missing mandatory production env vars abort startup.
- **Graceful degradation.** Cache/broker outages degrade features, they don't crash requests
  (unless the feature explicitly requires Redis).

## Documentation

- [architecture.md](docs/architecture.md) — topology, request lifecycle, scaling
- [api.md](docs/api.md) — REST conventions, pagination, error schema
- [database.md](docs/database.md) — schema, migrations, replicas
- [security.md](docs/security.md) — authN/authZ, token rotation, headers
- [observability.md](docs/observability.md) — logs, metrics, health
- [admin.md](docs/admin.md) — `/admin` Django-style DB admin panel (SQLAdmin)
- [deployment.md](docs/deployment.md) — Compose -> Kubernetes -> cloud
- [development.md](docs/development.md) — local workflow, testing
