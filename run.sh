#!/bin/bash
set -euo pipefail

docker compose up -d postgres redis
uv run alembic upgrade head

trap 'kill 0' EXIT
DEV_MODE=1 uv run uvicorn backend.main:app --reload --port 8000 &
(cd frontend && npm run dev) &
wait
