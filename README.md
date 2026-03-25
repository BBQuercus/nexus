# Nexus

Nexus is a FastAPI backend plus Next.js frontend. Local workflows are standardized with `just`, and Railway deployments are split into explicit `backend` and `frontend` services with separate staging and production environments.

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
- `RELEASE_VERSION`
- `BUILD_SHA`

Use environment-specific values for staging and production. Keep `COOKIE_SAMESITE=lax` if frontend and backend share the same site. Use `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true` if they do not.

## GitHub Actions setup

Repository variables:

- `RAILWAY_PROJECT_ID_STAGING`
- `RAILWAY_BACKEND_SERVICE_STAGING`
- `RAILWAY_FRONTEND_SERVICE_STAGING`
- `STAGING_FRONTEND_URL`
- `STAGING_BACKEND_URL`
- `RAILWAY_PROJECT_ID_PRODUCTION`
- `RAILWAY_BACKEND_SERVICE_PRODUCTION`
- `RAILWAY_FRONTEND_SERVICE_PRODUCTION`
- `PRODUCTION_FRONTEND_URL`
- `PRODUCTION_BACKEND_URL`

Repository secrets:

- `RAILWAY_TOKEN_STAGING`
- `RAILWAY_TOKEN_PRODUCTION`
- `RAILWAY_CI_TOKEN`

Workflows:

- `.github/workflows/ci.yml`: lint, type-check, tests, image builds
- `.github/workflows/deploy-staging.yml`: deploys `main` to Railway staging
- `.github/workflows/deploy-production.yml`: deploys tags like `v1.2.3` to production
- `.github/workflows/deploy-instance.yml`: manual deploy for another Railway instance
- `.github/workflows/monitor.yml`: scheduled smoke checks for staging and production

## Monitoring

Baseline monitoring is built around four layers:

- Railway health checks using `/ready`
- Deep app health via `/health`
- Prometheus metrics via `/metrics`
- OpenTelemetry export via `OTEL_EXPORTER_OTLP_ENDPOINT`

The scheduled monitor workflow runs `scripts/smoke_check.py` against staging and production every 15 minutes. Point `OTEL_EXPORTER_OTLP_ENDPOINT` at Grafana Cloud, Honeycomb, Datadog, or another OTLP collector to capture traces outside Railway.

## Manual deploys

Local Railway deploys use `just`:

```bash
just railway-deploy railway/backend.toml <backend-service> <project-id> staging
just railway-deploy railway/frontend.toml <frontend-service> <project-id> staging
```

Or deploy both services with:

```bash
just railway-deploy-staging <project-id> <backend-service> <frontend-service>
just railway-deploy-production <project-id> <backend-service> <frontend-service>
```
