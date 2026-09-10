# Development

## Prerequisites

- Docker + Docker Compose v2
- Node 20+ and Python 3.12+ (only if running a tier outside Docker)
- `make`

## First run

```bash
cp .env.example .env
make up          # build + start nginx, frontend, backend, postgres, redis, worker, beat
make migrate     # alembic upgrade head
make seed        # demo user: demo@acme.test / DemoPass123!
```

- App:        http://localhost
- Swagger:    http://localhost/api/v1/docs
- MailHog:    http://localhost:8025  (captures outbound email in dev)

## Common tasks

```bash
make logs service=backend
make sh service=backend            # shell into a container
make migration m="add widgets"     # autogenerate a revision
make test                          # backend + frontend test suites
make test-backend
make test-frontend
make e2e                           # Playwright against the compose stack
make lint                          # ruff + mypy + eslint + tsc
make fmt                           # ruff format + prettier
make openapi                       # regenerate openapi.json + frontend types
make down                          # stop, keep volumes
make clean                         # stop + remove volumes
```

## Running fully manual (no Docker, Windows)

You need a local **PostgreSQL 16** and a local **Redis 7** (Windows: `Memurai.MemuraiDeveloper`
via winget is Redis-7-compatible; WSL `redis-server` also works).

1. Create the DB:
   ```bat
   "C:\Program Files\PostgreSQL\16\bin\psql" -U postgres -c "CREATE ROLE acme LOGIN PASSWORD 'acme-dev-password';"
   "C:\Program Files\PostgreSQL\16\bin\psql" -U postgres -c "CREATE DATABASE acme OWNER acme;"
   ```
   (No PostgreSQL extensions are required — the migrations don't use any.)
2. `copy .env.example .env` at the repo root, then set the hosts to `localhost`:
   `POSTGRES_HOST`, `DATABASE_URL`, `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`,
   `SMTP_HOST`. `Settings` also reads `../.env`, so scripts run from `backend/` pick it up.

### Backend outside Docker

```bat
cd backend
python -m venv .venv && .venv\Scripts\activate.bat
pip install -r requirements\dev.txt
alembic upgrade head
python -m app.db.seed
python -m app.admin.create_superuser
uvicorn app.main:app --reload --port 8000
```

Optional Celery worker (Windows needs `--pool=solo`):
`celery -A app.workers.celery_app worker -Q default,emails,maintenance -l info --pool=solo`

### Frontend outside Docker

```bat
cd frontend
copy .env.example .env.local      # points the client at http://localhost:8000
npm install                       # first run; `npm ci` afterwards
npm run dev
```

App: http://localhost:3000 · API docs: http://localhost:8000/api/v1/docs ·
Admin: http://localhost:8000/admin

## Branching / commits

- Trunk-based: short-lived branches off `main`, PR required, CI green + 1 review.
- Conventional Commits. Squash-merge.
- Migrations and their model changes ship in the same PR.

## Testing layers

| Layer | Tooling | Location |
|-------|---------|----------|
| Backend unit | pytest | `backend/tests/unit` |
| Backend service/repo | pytest + testcontainers Postgres | `backend/tests/integration` |
| Backend API | pytest + httpx AsyncClient | `backend/tests/api` |
| Frontend unit/component | Vitest + Testing Library | `frontend/tests` |
| E2E | Playwright | `frontend/e2e` |

Tests use an **isolated database** (`acme_test`), migrations applied per session, transaction
rollback per test.
