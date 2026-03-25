set shell := ["zsh", "-cu"]

default:
  @just --list

install:
  uv sync --extra dev
  cd frontend && npm ci

lint:
  just lint-backend
  just lint-frontend

lint-backend:
  uv run ruff check backend/
  uv run ruff format --check backend/

lint-frontend:
  cd frontend && npm run lint

type-check:
  just type-check-backend
  just type-check-frontend

type-check-backend:
  uv run python -m mypy backend/ --ignore-missing-imports

type-check-frontend:
  cd frontend && npx tsc --noEmit

test: test-backend test-frontend

test-backend:
  uv run pytest tests/ -v --tb=short

test-frontend:
  cd frontend && npx vitest run --reporter=verbose --passWithNoTests

ci: lint type-check test build

build:
  docker build -f Dockerfile.backend -t nexus-backend:latest .
  docker build -f Dockerfile.frontend -t nexus-frontend:latest .

db-up:
  docker compose up -d postgres redis

db-down:
  docker compose down

migrate:
  uv run alembic upgrade head

dev:
  #!/usr/bin/env zsh
  set -euo pipefail
  docker compose up -d postgres redis
  uv run alembic upgrade head
  trap 'kill 0' EXIT
  DEV_MODE=1 uv run uvicorn backend.main:app --reload --port 8000 &
  (cd frontend && npm run dev) &
  wait

smoke frontend_url backend_url:
  uv run python scripts/smoke_check.py --frontend-url {{frontend_url}} --backend-url {{backend_url}}

railway-deploy config service project environment:
  #!/usr/bin/env zsh
  set -euo pipefail
  trap 'rm -f railway.toml' EXIT
  cp {{config}} railway.toml
  railway up --service {{service}} --project {{project}} --environment {{environment}} --ci

railway-deploy-staging project backend_service frontend_service:
  just railway-deploy railway/backend.toml {{backend_service}} {{project}} staging
  just railway-deploy railway/frontend.toml {{frontend_service}} {{project}} staging

railway-deploy-production project backend_service frontend_service:
  just railway-deploy railway/backend.toml {{backend_service}} {{project}} production
  just railway-deploy railway/frontend.toml {{frontend_service}} {{project}} production
