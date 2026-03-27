set shell := ["bash", "-cu"]

# List available recipes
default:
  @just --list

# ── Dependencies ──────────────────────────────────────────────────────────────

# Install all dependencies (backend + frontend)
install:
  uv sync --extra dev
  cd frontend && npm ci

# ── Development ───────────────────────────────────────────────────────────────

# Start postgres/redis, run migrations, then start backend + frontend
dev:
  #!/usr/bin/env bash
  set -euo pipefail
  docker compose up -d postgres redis
  uv run alembic upgrade head
  trap 'kill 0' EXIT
  DEV_MODE=1 uv run uvicorn backend.main:app --reload --port 8000 &
  (cd frontend && npm run dev) &
  wait

# Start postgres and redis only
db-up:
  docker compose up -d postgres redis

# Stop all compose services
db-down:
  docker compose down

# Run pending Alembic migrations
migrate:
  uv run alembic upgrade head

# Seed the database with development data
seed:
  uv run python scripts/seed_dev_data.py

# ── Code quality ──────────────────────────────────────────────────────────────

# Run all linters (backend + frontend)
lint:
  uv run ruff check backend/
  uv run ruff format --check backend/
  cd frontend && npm run lint

# Run all type checkers (backend + frontend)
type-check:
  uv run python -m mypy backend/ --ignore-missing-imports
  cd frontend && npx tsc --noEmit

# Auto-fix backend lint issues and format code
fix:
  uv run ruff check --fix backend/
  uv run ruff format backend/

# Format frontend source files with Prettier
format-frontend:
  cd frontend && npx prettier --write 'app/**/*.{ts,tsx}' 'components/**/*.{ts,tsx}' 'lib/**/*.{ts,tsx}'

# ── Testing ───────────────────────────────────────────────────────────────────

# Run all tests (backend + frontend)
test: test-backend test-frontend

# Run backend tests with pytest
test-backend:
  uv run pytest tests/ -v --tb=short

# Run frontend unit tests with vitest
test-frontend:
  cd frontend && npx vitest run --reporter=verbose --passWithNoTests

# Run Playwright end-to-end tests (pass extra args after --)
test-e2e *args:
  cd frontend && npx playwright test {{args}}

# ── Build & CI ────────────────────────────────────────────────────────────────

# Full CI pipeline: lint, type-check, test, build
ci: lint type-check test build

# Build Docker images for backend and frontend
build:
  docker build -f Dockerfile.backend -t nexus-backend:latest .
  docker build -f Dockerfile.frontend -t nexus-frontend:latest .

# ── Scripts ───────────────────────────────────────────────────────────────────

# Run post-deploy smoke checks (args: --frontend-url <url> --backend-url <url>)
smoke *args:
  uv run python scripts/smoke_check.py {{args}}

# Run landing-page prompt quality suite against a live backend
prompt-suite *args:
  uv run python scripts/run_landing_prompt_suite.py {{args}}

# Send a hello to every configured model and verify responses
test-models *args:
  uv run python scripts/test_all_models.py {{args}}

# Manage Azure AI Foundry model registrations in LiteLLM
litellm-models *args:
  uv run python scripts/litellm_foundry_models.py {{args}}

# ── Deployment ────────────────────────────────────────────────────────────────

# Deploy a single service to Railway (internal helper)
_railway-deploy config service project environment:
  #!/usr/bin/env bash
  set -euo pipefail
  trap 'rm -f railway.toml' EXIT
  cp {{config}} railway.toml
  railway up --service {{service}} --project {{project}} --environment {{environment}} --ci

# Deploy backend + frontend to the staging environment
deploy-staging project backend_service frontend_service:
  just _railway-deploy railway/backend.toml {{backend_service}} {{project}} staging
  just _railway-deploy railway/frontend.toml {{frontend_service}} {{project}} staging

# Deploy backend + frontend to production
deploy-production project backend_service frontend_service:
  just _railway-deploy railway/backend.toml {{backend_service}} {{project}} production
  just _railway-deploy railway/frontend.toml {{frontend_service}} {{project}} production
