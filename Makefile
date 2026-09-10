COMPOSE ?= docker compose
COMPOSE_PROD ?= docker compose -f docker-compose.prod.yml
service ?= backend
m ?= change

.DEFAULT_GOAL := help

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Build + start the full local stack
	$(COMPOSE) up -d --build

down: ## Stop the stack (keep volumes)
	$(COMPOSE) down

clean: ## Stop the stack and remove volumes
	$(COMPOSE) down -v

logs: ## Tail logs: make logs service=backend
	$(COMPOSE) logs -f $(service)

sh: ## Shell into a service: make sh service=backend
	$(COMPOSE) exec $(service) sh

ps: ## Show running services
	$(COMPOSE) ps

migrate: ## Apply DB migrations
	$(COMPOSE) exec backend alembic upgrade head

downgrade: ## Revert last migration
	$(COMPOSE) exec backend alembic downgrade -1

migration: ## Autogenerate a migration: make migration m="add widgets"
	$(COMPOSE) exec backend alembic revision --autogenerate -m "$(m)"

seed: ## Load demo data
	$(COMPOSE) exec backend python -m app.db.seed

superuser: ## Create/promote an /admin superuser (interactive, or ADMIN_EMAIL/ADMIN_PASSWORD env)
	$(COMPOSE) exec backend python -m app.admin.create_superuser

openapi: ## Regenerate openapi.json + frontend types
	$(COMPOSE) exec backend python -m app.scripts.export_openapi > openapi.json
	cd frontend && npm run gen:api

lint: ## Lint + typecheck everything
	$(COMPOSE) exec backend ruff check . && $(COMPOSE) exec backend mypy app
	cd frontend && npm run lint && npm run typecheck

fmt: ## Auto-format
	$(COMPOSE) exec backend ruff format .
	cd frontend && npm run format

test: test-backend test-frontend ## Run all tests

test-backend: ## Backend test suite
	$(COMPOSE) exec backend pytest -q

test-frontend: ## Frontend test suite
	cd frontend && npm run test

e2e: ## Playwright E2E against the stack
	cd frontend && npm run e2e

prod-up: ## Start the production compose stack
	$(COMPOSE_PROD) up -d

prod-deploy: ## Pull new images + rolling restart
	$(COMPOSE_PROD) pull && $(COMPOSE_PROD) up -d --remove-orphans

.PHONY: help up down clean logs sh ps migrate downgrade migration seed superuser openapi lint fmt test test-backend test-frontend e2e prod-up prod-deploy
