# Nexus — AI Instructions

## Quick Reference

```bash
just install          # Install all deps (uv sync + npm ci)
just dev              # Start postgres/redis, run migrations, start backend + frontend
just test             # Run all tests (backend + frontend)
just test-backend     # pytest tests/ -v
just test-frontend    # vitest
just test-e2e         # Playwright E2E
just lint             # Ruff (backend) + ESLint (frontend)
just type-check       # MyPy (backend) + tsc (frontend)
just ci               # Full pipeline: lint, type-check, test, build
just migrate          # Alembic upgrade head
```

## Stack

- **Backend:** FastAPI, SQLAlchemy (async), PostgreSQL, Redis, Alembic
- **Frontend:** Next.js 15, React 19, TypeScript (strict), Zustand, TailwindCSS
- **Python:** 3.12+, managed with `uv` (never pip)
- **Frontend packages:** npm (never yarn/pnpm)
- **Task runner:** `just` for everything

## Conventions

- **Migrations:** Alembic only. Never raw ALTER TABLE. Name pattern: `NNNN_verb_noun` (e.g., `0014_add_organizations_table`). Verify `alembic downgrade` works before merging.
- **Tests:** Every change should include tests unless the change is trivially obvious (e.g., .gitignore update). Run `just test` before committing.
- **Types:** Strict TypeScript on frontend, Pydantic + SQLAlchemy Mapped types on backend. No `any` unless unavoidable.
- **Formatting:** Ruff handles backend (line-length 120). No Prettier yet for frontend — follow existing style.
- **Imports:** Ruff auto-sorts. Frontend uses `@/*` path alias.
- **Deploy:** `git push` to main triggers Railway deploy. Never use `railway up` unless debugging.

## Patterns

### Backend

- **Errors:** `raise HTTPException(status_code=..., detail="...")`. No custom exception classes. `GlobalExceptionMiddleware` catches unhandled exceptions and returns structured JSON with `request_id`.
- **Auth:** `user_id: uuid.UUID = Depends(get_current_user)` on protected endpoints. Admin-only: `Depends(get_admin_user)` (checks role). CSRF: global `Depends(validate_csrf)` on all mutating methods.
- **Routers:** One file per feature in `backend/routers/`. Each defines `router = APIRouter(prefix="/api/{feature}")`. Register in `main.py` via `app.include_router()`.
- **Logging:** structlog with bound `request_id`.

### Frontend

- **State:** Zustand with slices (`session`, `conversation`, `streaming`, `composer`, `workspace`, `artifacts`, `branching`). Combined in `lib/store/index.ts`. Use via `useStore()` hook.
- **API calls:** `apiFetch<T>()` wrapper in `lib/api.ts`. Auto-handles JSON, CSRF, 401 redirect, error toasts. Export domain functions (`api.createConversation()`, etc.).
- **Styling:** Tailwind with design tokens via CSS custom properties in `globals.css` (e.g., `bg-surface-1`, `text-text-primary`, `border-border-default`). No CSS modules. Fonts: Inter (UI), IBM Plex Mono (code).
- **Components:** Flat structure with domain subfolders (`ui/`, `chat-input/`, `message-bubble/`, `sidebar/`, `workspace/`, `accessibility/`). Reusable primitives in `ui/` via shadcn/ui, themed with project design tokens. All UI elements must use shared primitives — no one-off styled elements.

### Commits

- Imperative present tense, capitalize first letter. Examples: "Add Playwright E2E test infrastructure", "Cache shiki syntax highlighting results (LRU, 200 entries)", "Fix CSRF token rotation on session refresh".
- **Commit often.** Each logical change gets its own commit — don't bundle unrelated work. One feature, one fix, or one refactor per commit.
- **Commit working code.** Every commit should pass `just lint` and `just test`. Don't commit broken intermediate states.
- **Keep commits small and reviewable.** If a change touches 10+ files, consider whether it can be split into smaller steps (e.g., "Add user_settings table" then "Add preferences UI").

## Architecture

- Backend serves API at `:8000`, frontend at `:5173`
- Frontend proxies `/api/*`, `/auth/*`, `/ws/*` to backend via Next.js rewrites
- Two DB engines: main (SQLAlchemy) + vector (pgvector) — consolidation planned
- Redis used for: rate limiting, session state, caching, background jobs (ARQ)
- Pre-commit hooks: ruff check/format + standard hygiene (trailing whitespace, large files, private keys)
- Read `PLAN.md` for the current roadmap. Respect the dependency graph.
- DB can be nuked freely — no production data exists yet.
