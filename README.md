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

## Quick start (local)

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
