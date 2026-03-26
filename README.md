# Nexus

Nexus is a FastAPI backend plus Next.js frontend. Local workflows are standardized with `just`, and Railway deployments are split into explicit `backend` and `frontend` services with separate dev and production environments.

## Local development

Install dependencies:

```bash
just install
```

Start local dependencies and both app servers:

```bash
just dev
```

Common commands:

```bash
just lint
just type-check
just test
just build
just migrate
```

## Landing prompt live suite

The landing-page prompt suite is a manual live validator that runs the real prompt cards against a real backend, then grades the result with a smaller judge model.

Local or Railway usage:

```bash
just landing-prompt-suite --base-url https://<backend>.up.railway.app \
  --email <test-user-email> \
  --password '<test-user-password>'
```

Useful options:

- `--execution-model <model>`: primary model under test
- `--judge-model <model>`: LLM-as-judge model
- `--auth-mode admin-token --admin-token <token>`: use the backend admin service token instead of user login
- `--execution-models a,b,c`: compare the same prompts across multiple execution models
- `--include-prompts prompt-a,prompt-b`: run only selected prompt IDs
- `--output-path reports/file.json`: write machine-readable results
- `--register-if-needed`: create the password user on first run if the environment allows registration

Recommended Railway setup:

- Prefer a dedicated backend admin service token for this suite in production-like environments.
- Set `ADMIN_API_TOKEN` and `ADMIN_API_USER_ID` on the backend service. `ADMIN_API_USER_ID` must be the UUID of a real admin or org-admin user in the deployed database.
- Then run:
  `just landing-prompt-suite --base-url https://<backend>.up.railway.app --auth-mode admin-token --admin-token "$NEXUS_ADMIN_API_TOKEN"`
- Create a dedicated low-privilege test user in WorkOS password auth.
- Store its credentials as local secrets or CI secrets, not in the repo.
- Point `--base-url` at the deployed backend service URL, not the frontend URL.
- Use password auth for Railway by default; the runner will keep the returned `session` and `csrf_token` cookies and send `X-CSRF-Token` automatically on state-changing requests.
- Use bearer-token mode only if you already have a short-lived access token and explicitly pass `--auth-mode bearer --bearer-token ...`.

## Railway topology

- `backend`: FastAPI service built from `Dockerfile.backend`
- `frontend`: Next.js standalone service built from `Dockerfile.frontend`
- `postgres`: Railway PostgreSQL service
- `redis`: Railway Redis service

Checked-in Railway manifests live in:

- `railway/backend.toml`
- `railway/frontend.toml`

The CI deploy workflow copies the right manifest into `railway.toml` before each deploy so service configuration stays in git instead of only in the Railway dashboard.

## Required Railway variables

Backend:

- `DATABASE_URL`
- `REDIS_URL`
- `SERVER_SECRET`
- `LITE_LLM_API_KEY`
- `LITE_LLM_URL`
- `WORKOS_API_KEY`
- `WORKOS_CLIENT_ID`
- `WORKOS_REDIRECT_URI`
- `FRONTEND_URL`
- `CORS_ORIGINS`
- `ENVIRONMENT`
- `COOKIE_SECURE`
- `COOKIE_SAMESITE`
- `COOKIE_DOMAIN`

Frontend:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_WS_BASE_URL`

Recommended observability variables:

- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_PROTOCOL`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `OTEL_EXPORTER_OTLP_INSECURE`
- `RELEASE_VERSION`
- `BUILD_SHA`

Use environment-specific values for dev and production. Keep `COOKIE_SAMESITE=lax` if frontend and backend share the same site. Use `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true` if they do not.

## GitHub Actions setup

Repository variables:

- `RAILWAY_PROJECT_ID_DEV`
- `RAILWAY_BACKEND_SERVICE_DEV`
- `RAILWAY_FRONTEND_SERVICE_DEV`
- `DEV_FRONTEND_URL`
- `DEV_BACKEND_URL`
- `RAILWAY_PROJECT_ID_PRODUCTION`
- `RAILWAY_BACKEND_SERVICE_PRODUCTION`
- `RAILWAY_FRONTEND_SERVICE_PRODUCTION`
- `PRODUCTION_FRONTEND_URL`
- `PRODUCTION_BACKEND_URL`

Repository secrets:

- `RAILWAY_TOKEN_DEV`
- `RAILWAY_TOKEN_PRODUCTION`
- `RAILWAY_CI_TOKEN`

Workflows:

- `.github/workflows/ci.yml`: lint, type-check, tests, image builds
- `.github/workflows/deploy-staging.yml`: deploys `dev` to Railway dev after CI succeeds
- `.github/workflows/deploy-production.yml`: deploys `main` to production after CI succeeds
- `.github/workflows/deploy-instance.yml`: manual deploy for another Railway instance
- `.github/workflows/monitor.yml`: scheduled smoke checks for dev and production

## Monitoring

Baseline monitoring is built around four layers:

- Railway health checks using `/ready`
- Deep app health via `/health`
- Prometheus metrics via `/metrics`
- OpenTelemetry export via `OTEL_EXPORTER_OTLP_ENDPOINT`

The scheduled monitor workflow runs `scripts/smoke_check.py` against dev and production every 15 minutes. `OTEL_EXPORTER_OTLP_PROTOCOL` supports both `grpc` and `http/protobuf`, which lets the backend send traces to a public Tempo endpoint even when the collector lives in a different Railway project. Use `OTEL_EXPORTER_OTLP_HEADERS` for multi-tenant collectors and `OTEL_EXPORTER_OTLP_INSECURE=true` only for plaintext collectors.

## Manual deploys

Local Railway deploys use `just`:

```bash
just railway-deploy railway/backend.toml <backend-service> <project-id> dev
just railway-deploy railway/frontend.toml <frontend-service> <project-id> dev
```

Or deploy both services with:

```bash
just railway-deploy-dev <project-id> <backend-service> <frontend-service>
just railway-deploy-production <project-id> <backend-service> <frontend-service>
```
