.PHONY: install lint type-check test test-backend test-frontend build ci dev db migrate

install:
	uv sync --extra dev
	cd frontend && npm install

lint:
	uv run ruff check backend/
	uv run ruff format --check backend/
	cd frontend && npm run lint

type-check:
	uv run python -m mypy backend/ --ignore-missing-imports
	cd frontend && npx tsc --noEmit

test: test-backend test-frontend

test-backend:
	uv run pytest tests/ -v --tb=short

test-frontend:
	cd frontend && npx vitest run --reporter=verbose --passWithNoTests

build:
	docker build -f Dockerfile.backend -t nexus-backend:latest .
	docker build -f Dockerfile.frontend -t nexus-frontend:latest .

ci: lint type-check test

dev:
	@echo "Starting backend and frontend dev servers..."
	@trap 'kill 0' EXIT; \
		uv run uvicorn backend.main:app --reload --port 8000 & \
		cd frontend && npm run dev & \
		wait

db:
	docker compose up -d

migrate:
	uv run alembic upgrade head
