# Monitoring Integration Audit

Date checked: 2026-03-25

## Goal

Capture the current state of the separate Railway `monitoring` project and how it could be connected to the `nexus` Railway project later.

This file is an audit note only. It does not change deployment or application behavior.

## Summary

The Railway `monitoring` project already contains a usable observability stack, but `nexus` is not wired into it yet.

Decision for `nexus` at this stage:

- Keep `Uptime Kuma`
- Keep `Tempo`
- Keep `Prometheus + Grafana`
- Defer `GlitchTip`
- Defer `Loki`

What is currently usable:

- Grafana is running and reachable.
- Loki is running and Grafana can query it.
- Tempo exists and exposes OTLP ingest endpoints internally.
- GlitchTip is deployed and reachable.
- Uptime Kuma is running and reachable.

What is not ready for `nexus` yet:

- No Prometheus instance is correctly configured for `nexus`.
- `nexus` does not currently export traces to Tempo.
- `nexus` does not currently send errors to GlitchTip.
- `nexus` does not currently ship logs into Loki.
- `nexus` is in a different Railway project, so `railway.internal` hostnames in `monitoring` are not directly reachable from `nexus`.

## Railway `monitoring` Project State

Services observed in Railway production:

- `Grafana`: running
- `Loki`: running
- `Redis`: running
- `Postgres`: running
- `Uptime Kuma`: running
- `glitchtip-worker`: running
- `glitchtip-web`: deployed and publicly reachable
- `Tempo`: present, with internal ingest endpoints configured

Public endpoints observed:

- Grafana: `https://artifact-grafana.up.railway.app`
- GlitchTip: `https://artifact-glitchtip.up.railway.app`
- Uptime Kuma: `https://artifact-kuma.up.railway.app`

## Verified Details

### Grafana

Grafana health responded successfully.

Configured Grafana datasources currently include:

- `Loki` -> `http://loki.railway.internal:3100`
- `Tempo` -> `http://tempo.railway.internal:3200`
- `Prometheus` -> `http://:` (broken / malformed)
- `prometheus-poll-patrol` -> external datasource for another project

Observed state:

- Loki datasource health: OK
- Tempo datasource exists in Grafana
- Built-in Prometheus datasource is misconfigured
- Existing Grafana dashboard inventory appears focused on another project (`Poll Patrol`)

Implication:

- Grafana itself is ready to use.
- Loki-backed dashboards can be built.
- Tempo-backed tracing can likely be used once traces arrive.
- Prometheus-based metrics for `nexus` are not ready until Prometheus is fixed or added.

### Loki

Loki is running and Grafana can query it successfully.

Implication:

- The log backend exists.
- `nexus` still needs a shipping path into Loki. There is no current log forwarder configured in this repo.

### Tempo

Tempo variables in Railway include:

- `INTERNAL_GRPC_INGEST=grpc://tempo.railway.internal:4317`
- `INTERNAL_HTTP_INGEST=http://tempo.railway.internal:4318`

Recent service logs show Tempo is alive and operating normally.

Implication:

- The trace backend exists.
- The current blocker is network reachability from the separate `nexus` project.

### GlitchTip

GlitchTip web is publicly reachable and worker + backing services are configured.

Implication:

- Error tracking infrastructure exists.
- `nexus` still needs SDK integration and DSN/project setup.

### Uptime Kuma

Uptime Kuma is publicly reachable.

Implication:

- Synthetic monitoring can be added without app code changes.
- Actual monitor inventory was not audited here.

## Current `nexus` State

The `nexus` repo already contains some observability hooks:

- Railway health checks
- `/ready`
- `/health`
- `/metrics`
- OpenTelemetry instrumentation in the backend
- Scheduled smoke checks via GitHub Actions

Relevant implementation state:

- Backend supports OTLP export when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (both gRPC and HTTP/protobuf).
- Backend exposes Prometheus metrics at `/metrics`.
- All Prometheus metrics are fully instrumented across the application:
  - HTTP request count and duration (via MetricsMiddleware)
  - LLM request count, duration, time-to-first-token, and token usage (input/output)
  - Tool execution count and duration by tool name
  - Sandbox create/execute/delete operations and active sandbox gauge
  - RAG query count and duration by phase (embedding/rerank/total)
  - Active SSE streams and stream duration
  - Active WebSocket connections
  - Error totals by type and component (api/llm/sandbox/rag/ws)
- Grafana dashboard JSON available at `grafana/nexus-dashboard.json` for import.
- Prometheus scrape config snippet at `grafana/prometheus-nexus.yml`.
- There is no Sentry/GlitchTip SDK integration in backend or frontend code.
- There is no log shipping integration to Loki in this repo.

Current production `nexus` observation:

- Backend Railway variables do not currently include `OTEL_EXPORTER_OTLP_ENDPOINT`.

## Main Architecture Constraint

The biggest blocker is Railway networking boundaries.

Railway private networking via `*.railway.internal` is scoped to a single Railway project environment, not across different projects.

Because `nexus` and `monitoring` are separate Railway projects:

- `nexus` cannot directly send traces to `tempo.railway.internal`
- `nexus` cannot directly send logs to `loki.railway.internal`
- Grafana can still consume its own internal datasources inside `monitoring`

Implication:

- Any cross-project integration needs either:
  - a public endpoint
  - a TCP proxy / exposed service
  - or moving the relevant monitoring component into the same Railway project as `nexus`

## Chosen Scope

The currently approved observability scope for `nexus` is:

### Keep

- `Uptime Kuma`
- `Tempo`
- `Prometheus + Grafana`

### Defer

- `GlitchTip`
- `Loki`

Reasoning:

- `Uptime Kuma` gives immediate external uptime checks with minimal effort.
- `Tempo` is a good fit because backend OpenTelemetry instrumentation already exists.
- `Prometheus + Grafana` are worth keeping because the backend already exposes useful metrics and Grafana is already available.
- `GlitchTip` is useful, but it requires extra SDK integration work and is not necessary for the first monitoring baseline.
- `Loki` is lower priority than metrics and traces, and log aggregation can wait until Railway logs become insufficient.

## What Would Be Needed To Wire This Up

### 1. Tracing to Tempo

Minimum requirements:

- Expose Tempo so `nexus` can reach it across projects
- Set `OTEL_EXPORTER_OTLP_ENDPOINT` in `nexus` backend

Important detail:

- The current `nexus` backend code uses the OTLP gRPC exporter, so the cleanest path is exposing Tempo gRPC ingest on port `4317`.
- If only OTLP HTTP on `4318` is exposed, backend code will need a small change to use the HTTP exporter instead of the gRPC exporter.

Optional cleanup:

- Set `RELEASE_VERSION`
- Set `BUILD_SHA`

### 2. Metrics in Grafana

Minimum requirements:

- Add or fix a Prometheus service in `monitoring`
- Configure Prometheus to scrape the public `nexus` backend `/metrics` endpoint (see `grafana/prometheus-nexus.yml`)
- Add a Grafana datasource for that Prometheus instance if needed
- Import the Nexus dashboard from `grafana/nexus-dashboard.json`

Done (code side):

- All Prometheus metrics are fully instrumented across LLM, tools, sandbox, RAG, streaming, and WebSocket components.
- Dashboard JSON and scrape config are ready to use.

Remaining (infrastructure side):

- The internal Prometheus datasource in Grafana is malformed and unusable — needs fixing in the monitoring project.
- Prometheus must be configured to scrape the public nexus backend URL.

### 3. Error Tracking via GlitchTip

Minimum requirements:

- Create a GlitchTip project for `nexus`
- Obtain DSN / project credentials
- Add Sentry-compatible SDK integration in:
  - backend
  - frontend
- Set environment variables in Railway

Current blocker:

- No code integration exists yet.
- Deferred for now.

### 4. Synthetic Monitoring via Uptime Kuma

Minimum requirements:

- Add monitors for:
  - frontend root URL
  - backend `/ready`
  - backend `/health`

Current blocker:

- No blocker at code level
- Operational setup still needs to be done in Kuma

### 5. Logs in Loki

Minimum requirements:

- Choose a shipping path from `nexus` to Loki
- Add a log shipper or collector
- Ensure cross-project network access works

Current blocker:

- No log forwarding path exists
- Cross-project internal DNS will not work
- Deferred for now.

## Recommended Implementation Order

Suggested order for implementation:

1. Uptime Kuma
2. Tempo tracing
3. Prometheus metrics
4. GlitchTip error tracking if needed later
5. Loki log shipping if needed later

Reasoning:

- Uptime Kuma is mostly operational setup.
- Tempo is closest to ready because backend OTel instrumentation already exists.
- Prometheus metrics already exist in the app, but the monitoring-side Prometheus setup is incomplete.
- GlitchTip requires app code changes and is deferred.
- Loki likely needs the most deployment/networking design and is deferred.

## What To Show In Grafana

The first Grafana dashboard for `nexus` should be operational rather than product analytics focused.

Recommended dashboard sections:

- Request volume
  - requests per second
  - split by route or endpoint group
- Error rate
  - 4xx vs 5xx
  - server error rate over time
- Latency
  - p50, p95, p99 request duration
- LLM behavior
  - LLM request count
  - LLM success/failure rate
  - LLM latency
  - time to first token
  - token usage in/out
- Tool and sandbox activity
  - tool execution count
  - tool failures
  - tool execution duration
  - sandbox operation failures
  - active sandboxes
- Streaming and WebSocket activity
  - active SSE streams
  - stream duration
  - active WebSocket connections
- RAG activity
  - query volume
  - duration by phase
- System error totals
  - errors by component such as `api`, `llm`, `sandbox`, `rag`, `ws`

These align with metrics already defined in the backend telemetry implementation.

## Open Questions

- Should cross-project integrations use public endpoints, Railway TCP proxy, or be moved into the `nexus` project?
- Do we want OTLP gRPC exposure for Tempo, or should backend tracing be switched to OTLP HTTP?
- Is there already a Prometheus service somewhere else that should scrape `nexus`, instead of adding one to `monitoring`?
- Do we want GlitchTip for backend only first, or backend + frontend together?
- Do we want GitHub Actions smoke checks and Uptime Kuma to coexist, or should Kuma replace those checks?

## Useful Existing Nexus Hooks

- Backend tracing + metrics definitions: `backend/telemetry.py`
- Metrics endpoint: `backend/main.py`
- Health endpoints: `backend/main.py`
- HTTP metrics middleware: `backend/middleware.py`
- LLM metrics instrumentation: `backend/services/llm.py`
- Token usage + stream metrics: `backend/services/agent/runner.py`
- Tool execution metrics: `backend/services/agent/tool_executor.py`
- Sandbox operation metrics: `backend/services/sandbox.py`
- RAG query metrics: `backend/services/rag/retrieval.py`
- WebSocket metrics: `backend/main.py`
- Grafana dashboard: `grafana/nexus-dashboard.json`
- Prometheus scrape config: `grafana/prometheus-nexus.yml`
- Observability env examples: `.env.example`
- Scheduled smoke checks: `.github/workflows/monitor.yml`
