#!/bin/bash
set -e

echo "=== Nexus Development Server ==="

# Start Postgres
echo "→ Starting Postgres..."
docker compose up -d postgres
echo "→ Waiting for Postgres..."
until docker compose exec postgres pg_isready -U nexus -q 2>/dev/null; do
  sleep 1
done
echo "→ Postgres ready."

# Backend setup
echo "→ Installing Python dependencies..."
uv sync

echo "→ Running migrations..."
uv run alembic upgrade head

# Frontend setup
echo "→ Installing frontend dependencies..."
cd frontend && npm install && cd ..

# Start backend
echo "→ Starting FastAPI (port 8000)..."
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Start frontend
echo "→ Starting Vite dev server (port 5173)..."
cd frontend && npm run dev &
FRONTEND_PID=$!

# Trap to cleanup on exit
trap "echo '→ Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker compose stop" EXIT

echo ""
echo "=== Nexus is running ==="
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000"
echo "  pgAdmin:  http://localhost:5050"
echo ""

wait
