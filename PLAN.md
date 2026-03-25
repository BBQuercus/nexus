# Nexus — Master Plan

**Last updated:** 2026-03-25
**Status:** All 10 initiatives structurally implemented; release gate green (see Implementation Log below)
**Goal:** Build the de-facto gold standard AI chat application.
**Sources:** Codebase audit, competitive analysis (ChatGPT, Claude.ai, Cursor, TypingMind, OpenWebUI, LibreChat), internal competitor teardown, colleague review, and tool implementation specs.

---

## Table of Contents

- [Current State](#current-state)
- [Competitive Landscape](#competitive-landscape)
- [Track A: Operational Reliability](#track-a-operational-reliability)
- [Track B: New Tools & Capabilities](#track-b-new-tools--capabilities)
- [Track C: Product Differentiation](#track-c-product-differentiation)
- [Track D: Enterprise & Collaboration](#track-d-enterprise--collaboration)
- [Testing & Quality Strategy](#testing--quality-strategy)
- [Open Questions & Design Decisions](#open-questions--design-decisions)
- [Initiative Sequence](#initiative-sequence)
- [Success Metrics](#success-metrics)

---

## Current State

### Scorecard

| Area | Details | Score |
|------|---------|-------|
| Architecture | Next.js 15 + FastAPI + PostgreSQL, fully async, clean separation | 9/10 |
| Type Safety | Strict TypeScript, Pydantic everywhere, SQLAlchemy Mapped types | 9/10 |
| Security | SSRF protection, CSRF tokens, CSP headers, auth redaction, sandbox ACL | 8/10 |
| Streaming | Token-by-token SSE, artifact streaming, tool execution progress | 8/10 |
| Feature Depth | RAG, sandboxes, agents, artifacts, branching, multi-model compare, TTS | 8/10 |
| Error Handling | Global middleware, request IDs, structlog, frontend error reporting | 8/10 |
| UI Polish | Dark theme, animations, command palette, keyboard shortcuts, responsive | 7/10 |
| Code Quality | Consistent patterns, async everywhere, good DB schema | 8/10 |
| Testing | 6 backend test files (security, tools, artifacts), 0 frontend | 3/10 |
| CI/CD | None | 0/10 |
| Observability | Structured logging only, no tracing or metrics | 3/10 |
| Caching | None (in-memory rate limiter only) | 2/10 |

**Overall: 7.5/10** — Production-ready for small teams, but missing the infrastructure and polish that separates good from legendary.

### internal competitor Comparison

internal competitor scores roughly **4/10**. Included here as a reference for what not to do and what ideas to steal.

**Critical failures:**
- Zero test coverage — no pytest, vitest, or any testing framework installed
- 97% unpinned dependencies — `requirements.txt` with no lockfile
- Azure Speech API key baked into frontend JS bundle
- Prompt injection in RAG — documents injected into system prompt without sanitization
- Wildcard CORS (`allow_methods=["*"]`), no CSP headers
- N+1 query hell — 51 DB queries for 50 messages
- DB polling anti-pattern — Google Search confirmation polls every second for 60 seconds
- Monolithic components — `Main.tsx` (974 lines, 25+ state variables), `ChatInterface.tsx` (1013 lines)
- Health endpoint returns static "UP" without checking dependencies
- 6 mixed icon libraries creating visual chaos
- Synchronous DB calls inside async functions blocking the event loop

**Worth stealing:**
- Visual agent builder (drag-and-drop node editor) — interesting UX concept, execute it better
- Clean backend architecture pattern (models → repos → services → controllers)
- Comprehensive file processing (8+ formats including audio transcription)
- Custom exception hierarchy (21 types) — more granular than ours

### Immediate Technical Debt

Items that won't be noticed by users but will bite as we scale:

| Issue | Location | Risk | Fix |
|-------|----------|------|-----|
| In-memory rate limiter | `backend/middleware/` | Resets on deploy, not multi-instance safe | Redis-backed limiter |
| No Python linting in CI | project root | Code quality drift | Add ruff to CI |
| 1378-line chat-input.tsx | `frontend/components/` | Impossible to maintain/test | Split into focused components |
| 766-line agent.py | `backend/services/` | Complex branching, hard to debug | Extract sub-modules |
| 820-line message-bubble.tsx | `frontend/components/` | Hard to test, change is risky | Split into focused components |
| 443-line sidebar.tsx | `frontend/components/` | Growing complexity | Extract sub-components |
| No frontend tests | `frontend/` | UI regressions unnoticed | Vitest + RTL |
| No CI/CD | `.github/workflows/` | Manual deploys, no safety net | GitHub Actions |
| Manual migrations in main.py | `backend/main.py` | Fragile, won't scale | Consolidate into Alembic |
| No connection pool tuning | `backend/database.py` | Connection exhaustion under load | Configure pool_size, max_overflow |
| Lazy Shiki in browser | `frontend/lib/` | Heavy main-thread computation | Move to Web Worker |

---

## Competitive Landscape

### What They Do That We Don't

**ChatGPT (OpenAI)**
- Canvas mode (collaborative document editing with AI)
- Memory across conversations (persistent user context)
- Custom GPTs marketplace
- Voice mode with emotion detection
- Deep research (multi-step autonomous research)
- Scheduled tasks ("remind me", "every Monday")

**Claude.ai (Anthropic)**
- Artifacts (we have this — ours is competitive)
- Projects with persistent instructions and files
- Extended thinking (visible reasoning chains)
- MCP integrations (standardized tool protocol)
- Styles (adjustable response personality)

**Cursor**
- Codebase-wide context (index entire repos)
- Multi-file editing in one operation
- Terminal integration with AI
- Git-aware suggestions
- Apply-to-codebase for generated code

**TypingMind**
- Plugin system (custom JavaScript tools)
- Prompt library with variables
- Multiple chat profiles
- Local-first (runs without server)
- Character/persona marketplace

**Open WebUI**
- Extensive model management (Ollama integration)
- RAG with web search
- Pipelines (custom middleware)
- Community model/prompt sharing
- Multi-user with granular permissions

### What Nobody Does Well Yet (Our Opportunity)

- **True multi-agent workflows** — orchestrating multiple agents on complex tasks, not just one-at-a-time chat
- **AI-native project management** — conversations that become tasks, decisions that become documentation
- **Institutional memory** — AI that learns from organizational patterns over time
- **Audit & compliance** — enterprise-grade logging that satisfies SOC2/HIPAA without sacrificing UX
- **Developer-extensible everything** — API-first design where every feature is also an API endpoint

---

## Track A: Operational Reliability

Reliability work starts immediately and runs in parallel with feature work. The first shipping priority is making the system trustworthy.

---

### A1. Quality Gates & CI/CD

#### Why

The codebase has useful backend tests, but no dependable release gate. A world-class product needs a clear answer to "what proves this build is safe to ship?"

#### CI/CD Pipeline

Currently nothing. Target: full GitHub Actions with staging + production.

- [ ] **PR checks** — lint (ruff + eslint), type check (mypy + tsc), test (pytest + vitest), build
- [ ] **Staging deploy** — auto-deploy on PR merge to `develop`
- [ ] **Production deploy** — manual approval gate, deploy on merge to `main`
- [ ] **Database migrations** — auto-run Alembic in CI with rollback plan
- [ ] **Dependency scanning** — Dependabot or Renovate for automated updates
- [ ] **Security scanning** — Snyk or Trivy for vulnerabilities in deps and Docker images
- [ ] **Performance budgets** — fail CI if bundle size exceeds threshold
- [ ] **Preview deployments** — unique URL per PR for visual review

#### Release Engineering

- [ ] Standardize environments: local, preview/staging, production with clearly defined config parity
- [ ] Add release versioning and changelog discipline — tag backend and frontend builds, carry release IDs in logs and errors
- [ ] Add rollback readiness — application rollback, migration safety check, feature-flag disablement
- [ ] Introduce feature flags for risky capabilities — multi-agent branching, sandbox execution, new retrieval modes, experimental UI panels

#### Release-Blocking Scenarios

Before merge:
- backend unit/integration tests pass
- frontend component tests pass
- end-to-end smoke tests pass
- lint/type checks pass

Before production deploy:
- all of the above
- migration validation
- sandbox integration smoke test
- LLM proxy connectivity smoke test

#### Definition of Done

- `make test` or equivalent runs all critical checks
- CI blocks merges on failures
- A production incident does not require ad hoc SSH heroics
- The team can deploy, verify, and roll back safely

---

### A2. Refactor Architectural Hotspots

#### Why

Too much critical behavior is concentrated in a few large modules. That makes change expensive and regressions likely.

#### Backend

1. **Break up `backend/services/agent.py` (766 lines)**
   - Extract: conversation history builder, tool call executor, retrieval orchestration, artifact collector, streaming event mapper, usage accounting
   - Keep one thin top-level runtime coordinator

2. **Create explicit tool contracts**
   - Standardize tool input validation, output schema, logging, and error classification
   - Every tool gets: typed input, typed result, timeout behavior, retry policy, redaction rules

3. **Separate runtime boot from schema management**
   - Remove schema mutation logic from app startup
   - Use Alembic migrations only for schema changes
   - Make startup fail clearly if schema is incompatible

4. **Introduce a service boundary for sandbox execution**
   - Separate: sandbox lifecycle, command execution, filesystem access, artifact discovery, terminal streaming
   - Makes testing easier and allows swapping providers later

#### Frontend

1. **Split the global Zustand store into focused slices**
   - session/auth, conversation data, composer/input, streaming/execution, workspace chrome/layout, artifacts/preview

2. **Break up large components**
   - `chat-input.tsx` (1378 lines) → InputField, FileUploader, ModelPicker, AgentPicker, KBPicker, VoiceInput
   - `message-bubble.tsx` (820 lines) → MessageContent, ToolCallDisplay, CitationList, MessageActions, BranchIndicator
   - `sidebar.tsx` (443 lines) → ConversationList, ConversationItem, SidebarActions, PinnedItems

3. **Reduce logic concentration in `workspace.tsx`**
   - Extract: keyboard shortcut manager, drag-and-drop manager, focus mode manager, shell layout controller

4. **Formalize API state handling**
   - Standardize request states, optimistic updates, retries, and error surfaces
   - Prevent each component from reinventing its own loading/error lifecycle

5. **Error boundary improvements**
   - Per-panel error boundaries (chat, sidebar, right panel) so one crash doesn't kill the whole app

#### Definition of Done

- No single file remains the only place that understands the full system
- Critical flows can be tested through small modules as well as end-to-end
- Onboarding a new engineer no longer requires reading giant "god files" first

---

### A3. Observability

#### Why

For agent systems, plain API logs are not enough. You need to understand what the model did, what tools it touched, why a run failed, and how often users experience degraded output.

#### Run-Level Tracing

Every agent run gets a trace/span tree with:
- conversation ID, user ID, model, mode/persona
- tool call sequence with timing
- retrieval invocations (hit/miss, relevance scores)
- sandbox lifecycle events
- token usage and cost

#### Structured Event Taxonomy

Standard event names for:
- stream started/completed/aborted
- tool call started/succeeded/failed
- sandbox create/start/stop/delete
- retrieval hit/miss
- artifact emitted
- user-visible error categories

#### User-Facing Quality Metrics

- Time to first token
- Time to final answer
- Tool success rate
- Sandbox creation success rate
- Retrieval usage and usefulness
- Run abort rate
- Frontend crash rate
- Session refresh failures

#### Infrastructure

- [ ] **Distributed tracing** — OpenTelemetry across frontend → API → LLM → sandbox
- [ ] **Application metrics** — Prometheus/Grafana for latency, error rates, token usage
- [ ] **Error tracking** — Sentry for both frontend and backend
- [ ] **Log aggregation** — structured logs shipped to central store (Loki, Datadog)
- [ ] **Alerting** — PagerDuty/Slack for error spikes, degraded LLM proxy health, sandbox failures, long-tail latency, repeated streaming disconnects, database issues
- [ ] **Synthetic monitoring** — scheduled health checks from external locations
- [ ] **Real User Monitoring (RUM)** — Core Web Vitals tracking
- [ ] **Cost monitoring** — LLM API spend in real-time with budget alerts
- [ ] **Frontend error reporting with release tagging** — capture release version, route, conversation ID, browser details, UI state context

#### Definition of Done

- Any major failure can be traced from user action to backend/tool/sandbox event
- The team can answer "what broke?" and "how often?" quickly

---

### A4. Runtime Boundary Hardening

#### Why

AI products fail at integration edges: model proxies, browsers, websockets, SSE, file uploads, background jobs, third-party services.

#### Timeout & Retry Policies

Define per dependency class:
- LLM proxy — current: 1 retry with backoff on 429/500/503/504. Formalize and make configurable.
- Web search — timeout + fallback messaging
- External APIs (call_api tool) — user-configurable timeout, default 15s
- Sandbox provider (Daytona) — creation timeout, execution timeout (120s), reconnect on WebSocket drop
- Storage — retry on transient failures
- Database — connection pool with health checking

#### Circuit Breakers

- If retrieval is down → answer without it, surface degraded state to user
- If sandbox is down → disable execution affordances instead of partial broken behavior
- If LLM proxy returns repeated 5xx → backoff, notify user, suggest model switch

#### Streaming Hardening

- [ ] Resume/reconnect strategy where possible
- [ ] Explicit cancellation propagation (user cancels → backend cancels LLM call → cleans up)
- [ ] Orphaned stream cleanup (detect and terminate stuck streams)
- [ ] Stronger client-side handling for partial event streams

#### Background Cleanup Jobs

- [ ] Stale sandbox cleanup (sandboxes idle >X hours)
- [ ] Orphaned artifact cleanup
- [ ] Expired upload cleanup
- [ ] Telemetry compaction/retention

#### Defensive Limits

- [ ] Max tool iterations per agent run
- [ ] Max artifact size
- [ ] Max upload size (enforce before reading into memory — internal competitor checks after, causing OOM risk)
- [ ] Max generated chart/table payload
- [ ] Rate limits by user and endpoint class (Redis-backed, not in-memory)

#### Definition of Done

- External dependency failures degrade gracefully instead of causing confusing UI states
- Long-running sessions do not accumulate leaked resources

---

### A5. Caching & Performance

Currently no caching layer. Target: multi-layer caching, distributed rate limiting.

- [ ] **Redis** — distributed rate limiting, session cache, frequently-accessed data (agent personas, knowledge base metadata, user settings)
- [ ] **Embedding cache** — cache embeddings for frequently-searched documents
- [ ] **CDN** — static assets (JS, CSS, images) served from edge
- [ ] **Database query optimization** — query analysis, missing indexes, connection pool tuning (pool_size, max_overflow)
- [ ] **LLM response caching** — cache identical prompts with TTL for cost savings
- [ ] **Frontend bundle optimization** — code splitting per route, tree shaking, lazy imports
- [ ] **Virtual scrolling** — chat history and sidebar must handle 10,000+ items without lag (react-window or similar)
- [ ] **Web Workers** — offload markdown parsing, syntax highlighting, search indexing off the main thread
- [ ] **Optimistic UI** — messages appear instantly, sync in background
- [ ] **Skeleton loading** — content-aware loading states (not spinners)
- [ ] **Prefetching** — preload likely-needed data (next conversation, recent artifacts)

---

### A6. Security & Compliance

#### Why

A sandboxed AI workspace handles code, files, external calls, and generated artifacts. That attracts scrutiny.

#### Threat Model

Perform a pass on:
- Auth/session handling
- File uploads (enforce size before reading into memory)
- Sandbox escape paths (filesystem, network, process boundaries)
- SSRF through API/web tools (already have IP blocklist — validate completeness)
- Prompt injection via uploaded/retrieved content (internal competitor has this vulnerability — ensure we don't)
- Artifact serving and path traversal

#### Auditability

- [ ] Record who did what, when, with which tools and outputs
- [ ] Admin-visible audit trails for sensitive actions
- [ ] Immutable audit log (append-only, not editable)

#### Dependency & Secret Hygiene

- [ ] Dependency scanning in CI (Snyk/Trivy)
- [ ] Secret scanning (prevent commits with API keys — git-secrets or similar)
- [ ] Pin or constrain critical runtime dependencies

#### Redaction Policy

Explicit rules for:
- Secrets and auth headers (already redacting in SSE payloads — formalize)
- Uploaded private data (log metadata, not content)
- Retrieved enterprise content (don't persist in logs)
- User PII in telemetry

#### Sandbox Isolation Validation

- [ ] Document filesystem boundaries, network boundaries, process limits, cleanup guarantees
- [ ] Test sandbox escape scenarios
- [ ] Verify cleanup actually removes all sandbox data

#### Definition of Done

- Security posture is documented, tested, and not based on assumptions hidden in vendor docs

---

### A7. Code Quality Infrastructure

- [ ] **Python linting** — `ruff check` and `ruff format` in pre-commit and CI
- [ ] **Pre-commit hooks** — lint-staged + husky for frontend, pre-commit for Python
- [ ] **API documentation** — expose FastAPI's auto-generated OpenAPI docs
- [ ] **Architecture decision records (ADRs)** — document why major decisions were made
- [ ] **Deterministic fixtures for agent runs** — record representative tool-heavy interactions, snapshot expected event sequences and artifacts, use to catch regressions in streaming/tool orchestration/message shaping

---

## Track B: New Tools & Capabilities

### B1. `call_api` — HTTP Requests Without Sandbox

Already implemented. Specification for reference:

**Backend:** `backend/services/web.py`
- httpx async client, configurable timeout (default 15s)
- Methods: GET, POST, PUT, DELETE, PATCH
- Params: `url`, `method`, `headers`, `body`, `auth_type` (none/bearer/basic), `auth_value`
- SSRF protection: block private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, ::1)
- Response: status_code, response_headers, body (truncated 8000 chars), duration_ms
- Parse JSON automatically, redact auth values from logs/SSE/persisted output

**Tool definition:**
```json
{
  "name": "call_api",
  "description": "Make an HTTP request to an external API.",
  "parameters": {
    "url": "string (required)",
    "method": "enum [GET, POST, PUT, DELETE, PATCH], default GET",
    "headers": "object (optional)",
    "body": "string (optional)",
    "auth_type": "enum [none, bearer, basic], default none",
    "auth_value": "string (optional)"
  }
}
```

---

### B2. `web_browse` — Fetch & Extract Readable Content

Already implemented. Specification for reference:

**Backend:** `backend/services/web.py`
- trafilatura for content extraction
- Follow redirects, browser-like UA, timeout 10s
- Truncate to ~4000 chars to fit LLM context
- Fallback: basic HTML tag stripping if trafilatura fails
- Reuses SSRF protection from call_api

**Tool definition:**
```json
{
  "name": "web_browse",
  "description": "Fetch and read the content of a webpage.",
  "parameters": {
    "url": "string (required)",
    "extract_links": "boolean (optional, default false)"
  }
}
```

Returns: url, final_url, status_code, title, author, date, main_text, word_count, links (if requested)

---

### B3. `create_chart` — Interactive Vega-Lite Charts

Already implemented. Specification for reference:

**Frontend:** vega-embed (npm), lazy-loaded
**Backend:**
```json
{
  "name": "create_chart",
  "description": "Create an interactive chart via Vega-Lite specification.",
  "parameters": {
    "spec": "object (required) — complete Vega-Lite JSON spec with data",
    "title": "string (optional)"
  }
}
```

- Validate spec has required Vega-Lite fields ($schema, mark or layer)
- Yield SSE event `chart_output`, save as artifact type `chart`
- Frontend applies dark theme, provides Download PNG/SVG/fullscreen
- v1: spec-defined interactivity works as authored, zoom/pan not auto-added

---

### B4. `run_sql` — DuckDB Queries on Data Files

Already implemented. Specification for reference:

**Sandbox dependency:** duckdb (pip)
```json
{
  "name": "run_sql",
  "description": "Run SQL on data files using DuckDB. Files auto-register as tables.",
  "parameters": {
    "sql": "string (required)",
    "output_format": "enum [table, csv, json], default table"
  }
}
```

- Generated Python script: import duckdb, discover CSV/Excel/Parquet, run query, format output
- Sanitize filenames into valid SQL table names
- Print schema info on failure (available tables + columns)
- Streamed table handling and/or persisted table artifacts

---

### B5. `create_ui` — Interactive Forms & Micro-Apps

**Status: Design phase. Not yet implemented.**

This is the most architecturally significant new tool. It turns Nexus from a text-and-artifact tool into a platform where the AI can create interactive experiences for the user.

#### Core Concept

The AI generates a UI component (form, dashboard, calculator, questionnaire) that renders inline in the chat. The user interacts with it, and submissions flow back to the AI as structured data for further processing.

#### Open Design Questions

These need resolution before implementation:

1. **Rendering approach: JSON schema vs HTML/React vs sandboxed iframe?**

   | Approach | Pros | Cons |
   |----------|------|------|
   | JSON schema → predefined components | Safe, predictable, easy to theme | Limited expressiveness, every new widget needs code |
   | AI-generated React/HTML rendered inline | Maximum flexibility, AI can build anything | XSS risk, CSP violations, hard to sandbox |
   | Sandboxed iframe (like sandbox preview) | Full isolation, any HTML/JS works | Heavyweight, communication via postMessage, styling mismatch |
   | Hybrid: JSON for forms, iframe for custom | Best of both for common vs advanced cases | Two systems to maintain |

   **Recommendation:** Start with JSON schema for forms and questionnaires (covers 80% of use cases safely), add sandboxed iframe for custom dashboards/apps later. The JSON approach lets us ship fast with full theme integration and zero security risk. The iframe path can reuse the existing sandbox preview infrastructure.

2. **Response flow: how do form submissions reach the AI?**

   Options:
   - **Inject as user message:** Form data becomes a synthetic user message that triggers a new agent run. Simple, works with existing architecture. Downside: clutters conversation with form data.
   - **Tool result callback:** Form data is returned as the result of the `create_ui` tool call, as if the tool "waited" for user input. More elegant but requires holding a tool call open indefinitely (or resuming a paused run).
   - **Dedicated form submission endpoint:** Backend receives form data, creates a structured message, triggers agent. Most flexible, cleanest separation.

   **Recommendation:** Start with "inject as user message" for v1 — it's simple and doesn't require new infrastructure. Format the submission as structured data (JSON) in a system-tagged message so the AI can distinguish it from free-text input. Add the dedicated endpoint in v2 when we need multi-step forms or background processing.

3. **Scope: forms only, or also interactive dashboards/calculators?**

   Forms (text inputs, selects, checkboxes, date pickers, file uploads) are the safe starting scope. But the real power comes from:
   - Live dashboards that update from data queries
   - Calculators with reactive formulas
   - Multi-step wizards with conditional logic
   - Approval/review interfaces

   **Recommendation:** v1 = forms and questionnaires only. v2 = add reactive components (computed fields, conditional visibility). v3 = full interactive apps via sandboxed iframe.

4. **Security model**

   JSON-schema forms are inherently safe — we control the renderer, there's no arbitrary code execution. For the iframe path later:
   - Render in a sandboxed iframe with `sandbox="allow-scripts"` (no allow-same-origin)
   - Communication via postMessage with origin validation
   - No access to parent page cookies, storage, or DOM
   - CSP on the iframe content to block external script loading

5. **Component library for JSON schema forms**

   Minimum viable set:
   - Text input (single line, multiline)
   - Number input (with min/max/step)
   - Select / dropdown (single, multi)
   - Checkbox / toggle
   - Radio group
   - Date / datetime picker
   - File upload
   - Slider / range
   - Rating (stars)
   - Rich text (markdown editor)
   - Table input (editable rows)
   - Conditional sections (show/hide based on other field values)

#### Proposed Tool Definition (v1)

```json
{
  "name": "create_ui",
  "description": "Create an interactive form or questionnaire. The user fills it out and the response is sent back to you as structured data.",
  "parameters": {
    "title": "string (required) — form title",
    "description": "string (optional) — instructions for the user",
    "fields": [
      {
        "id": "string — unique field identifier",
        "type": "enum [text, textarea, number, select, multiselect, checkbox, radio, date, datetime, file, slider, rating, table]",
        "label": "string",
        "placeholder": "string (optional)",
        "required": "boolean (default false)",
        "default": "any (optional)",
        "options": "array (for select/radio/multiselect)",
        "validation": {
          "min": "number (optional)",
          "max": "number (optional)",
          "pattern": "string (optional, regex)",
          "message": "string (optional, custom error message)"
        },
        "condition": {
          "field": "string — id of controlling field",
          "equals": "any — value that makes this field visible"
        }
      }
    ],
    "submit_label": "string (optional, default 'Submit')",
    "allow_multiple": "boolean (optional, default false) — allow resubmission"
  }
}
```

#### Implementation Order

1. Backend: tool definition, validation, SSE event type `ui_form`
2. Frontend: `FormRenderer.tsx` component that maps JSON schema to themed form components
3. Frontend: form submission handler — format as structured user message
4. Backend: recognize form submission messages, pass structured data to agent
5. Artifact persistence — save form definition and responses as artifacts

#### What This Unlocks

- **Data collection**: AI creates a survey, user fills it out, AI analyzes results
- **Onboarding flows**: AI guides user through setup via multi-step forms
- **Decision frameworks**: AI creates a weighted scoring form, user rates options, AI recommends
- **Report builders**: AI creates a parameterized form, user fills in inputs, AI generates custom report
- **Approval workflows**: AI prepares a summary + approve/reject form, user decides

---

### B6. Future Tool Ideas (Not Yet Designed)

Captured here for tracking. Each needs its own design phase.

- [ ] **`connect_database`** — Connect to external PostgreSQL/MySQL/SQLite, run read-only queries, visualize results. Security: read-only connections only, credential storage in encrypted vault, query timeout, result size limits.
- [ ] **`generate_image`** — DALL-E / Flux / Stable Diffusion integration. Inline preview, variation generation, upscaling. Need to decide: API-direct or sandbox-based?
- [ ] **`create_presentation`** — Generate slide decks from conversation content. Output: PPTX file or HTML slides. Complex — defer until artifact system is mature.
- [ ] **`git_operations`** — Clone repos into sandbox, make changes, create PRs. Would make Nexus competitive with Cursor for certain workflows. Needs careful sandboxing.
- [ ] **`schedule_task`** — Run an agent on a cron schedule. Requires: background job infrastructure (currently none), persistent task state, notification on completion/failure.

---

## Track C: Product Differentiation

### C1. Make the Agent's Work Legible

#### Why

Most AI tools still feel magical in the bad sense: users cannot tell what happened. Nexus wins by making execution transparent without overwhelming.

#### Execution Timeline

- [ ] Show: reasoning summary, retrieval steps, tool calls (with timing), sandbox commands, generated files, final outputs
- [ ] Collapsible by default, expandable for power users
- [ ] Each step shows duration and tokens consumed

#### Provenance UI

- [ ] Distinguish clearly between: model answer, cited source, retrieved context, computed artifact, sandbox-generated file
- [ ] Visual indicators (icons, colors, labels) for each source type
- [ ] Hovering a citation shows the source passage inline

#### Reversible Actions

- [ ] Rerun from any step in the execution timeline
- [ ] Branch from a tool result (what if we used a different approach?)
- [ ] Fork from any message (not just the last one)
- [ ] Compare two runs side by side with diff highlighting

#### Post-Run Summaries

- [ ] "What I did" — steps taken
- [ ] "What I changed" — files modified, artifacts created
- [ ] "What to review" — things that need human verification
- [ ] "What I'm uncertain about" — low-confidence results, weak retrieval, failed tools

---

### C2. Artifacts as a Core Product Surface

#### Why

The artifact model is one of Nexus's strongest advantages. Most AI chat apps treat outputs as text blobs.

#### Unified Artifact Center

- [ ] Central view for all artifacts: charts, tables, code files, reports, generated media, downloadable bundles
- [ ] Search and filter artifacts across conversations
- [ ] Pin/favorite artifacts for quick access

#### Artifact Lineage

- [ ] Show which prompt, tool call, dataset, or file produced each artifact
- [ ] Link artifacts to their source conversation and message

#### Live Artifact Updates

- [ ] When the agent iterates, the artifact updates in place with version history
- [ ] Diff view between artifact versions
- [ ] Rollback to previous version

#### Richer Viewers

- [ ] Notebook-like data view (for DataFrames/tables)
- [ ] File diff view (for code artifacts)
- [ ] Chart editing (tweak Vega-Lite spec, see results live)
- [ ] Side-by-side before/after comparison

#### Export Workflows

- [ ] Shareable report (public link with optional expiry)
- [ ] Downloadable project bundle (all artifacts + conversation)
- [ ] Reusable notebook/script (export code artifacts as .py/.js)
- [ ] Export conversation as Markdown/PDF

---

### C3. Conversation Intelligence

- [ ] **Full-text search** across all conversations, messages, and artifacts with instant results
- [ ] **Smart folders / tags** — auto-categorize by topic, project, or custom tags
- [ ] **Pinned messages** within conversations — bookmark the important parts
- [ ] **Conversation templates** — start from a template (code review, data analysis, writing, brainstorm)
- [ ] **Session continuity** — "Continue where I left off" with context summary when returning to old conversations
- [ ] **Cross-conversation context** — reference or link between conversations

---

### C4. Message-Level Power

- [ ] **Copy as markdown/code/plain text** — one-click with format selection
- [ ] **Share a single message** — generate a shareable link to one message or artifact
- [ ] **Message annotations** — add notes to AI responses (corrections, context, tags)
- [ ] **Inline editing** — edit any previous message and regenerate from that point
- [ ] **Diff view** — when regenerating, show what changed between versions
- [ ] **Message threading** — reply to a specific message within the conversation (nested threads)

---

### C5. Multi-Modal First Class

- [ ] **Vision input** — paste/drag screenshots, photos, diagrams → auto-route to vision-capable models
- [ ] **Image generation** — integrated (DALL-E, Flux) with inline preview and variation generation
- [ ] **Voice mode** — full conversation mode (not just TTS), with continuous listening
- [ ] **Video/screen capture** — record screen, send frames to vision model
- [ ] **Handwriting/sketch input** — draw diagrams on tablet, AI interprets
- [ ] **File intelligence** — drop any file type and get smart analysis (not just RAG ingestion)

---

### C6. Multi-Path Exploration

#### Why

Branching and comparison can be a genuine product advantage if executed cleanly. The tree panel exists but the UX needs to make it a signature feature, not a hidden capability.

#### Run Branching

- [ ] Branch from: a prompt, a tool call, a retrieval strategy, a chosen model
- [ ] Inline "try with different approach" button on any message
- [ ] Branch indicator showing how many alternatives exist

#### Compare Mode

- [ ] Compare two model outputs side by side with diff highlighting
- [ ] Compare two tool strategies (different parameters, different tools)
- [ ] Compare two artifact versions

#### Best-of-N Workflows

- [ ] Generate multiple approaches in parallel
- [ ] Score them on defined criteria (cost, quality, speed)
- [ ] Let user adopt one or merge ideas

#### Explainable Differences

- [ ] Summarize how branch A differs from branch B in conclusions, files, artifacts, and sources

---

### C7. Deepen the Workspace

#### Why

The strongest strategic direction is not "better chat." It is "AI-native workspace for real work."

- [ ] **Reusable projects/workspaces** — persistent context, files, tools, and preferred models
- [ ] **Task-oriented layouts** — coding mode, research mode, data analysis mode, document mode
- [ ] **Session memory controls** — what context is attached, what is pinned, project memory vs conversation memory
- [ ] **Persistent AI memory** — remembers user preferences, past decisions, project context across conversations
- [ ] **Memory management UI** — view, edit, delete what the AI remembers
- [ ] **Durable task objects** — a run can be promoted into a task with status, outputs, and follow-up actions
- [ ] **Context window visualization** — show how much context is used, what's included, what's been truncated

---

### C8. Best-in-Class Coding & Data Work

#### Why

Sandboxed execution plus artifacts is a major advantage if the app becomes excellent at coding and analysis workflows.

#### Code Execution Ergonomics

- [ ] Visible file tree diffs (what changed in the sandbox)
- [ ] Command history with rerun
- [ ] Save/restore checkpoints
- [ ] Multi-language sandboxes with package installation (Python, JS, TS, Go, Rust, SQL)
- [ ] Persistent environments (keep sandbox state between messages)

#### Data Workflows

- [ ] Dataset schema preview (auto-detect columns, types, sample values on upload)
- [ ] Automatic data profiling (distributions, nulls, outliers)
- [ ] Chart suggestions based on data shape
- [ ] Table transforms (sort, filter, group — interactive)
- [ ] Notebook-style replay of analysis steps

#### Language-Specific Workflows

- [ ] Python project scaffold
- [ ] Web app scaffold (React, Vue, etc.)
- [ ] SQL exploration mode (connect to DB, explore schema, run queries)
- [ ] Test generation and fix loop

#### Inspect Before Apply

- [ ] Show proposed changes with risk classification
- [ ] List tests to run
- [ ] Provide revert controls
- [ ] "Apply" button that writes changes to sandbox

---

### C9. Model Management

- [ ] **Model comparison 2.0** — side-by-side with diff highlighting, auto-scoring, cost comparison
- [ ] **Model routing** — auto-select best model based on task type (code → Claude, creative → GPT, fast → Haiku)
- [ ] **Model favorites & defaults** — per-agent, per-conversation, per-task-type
- [ ] **Custom model endpoints** — add your own OpenAI-compatible endpoints (Ollama, vLLM, local models)
- [ ] **Model performance dashboard** — track latency, quality ratings, cost per model over time
- [ ] **Prompt caching awareness** — show when prompt cache hits, estimated savings

---

### C10. UX Excellence

#### Onboarding & Empty States

- [ ] Communicate what Nexus is in one sentence on first run
- [ ] Make the first successful action extremely obvious
- [ ] Empty states that are instructional, not decorative — tailored by workflow type

#### System State Visibility

- [ ] Sandbox running/stopped/degraded indicator
- [ ] Retrieval available/unavailable
- [ ] Model/provider status (healthy, degraded, down)
- [ ] Long-running task progress

#### Confidence & Uncertainty Signaling

- [ ] Not generic disclaimers — clear markers for inferred results, weak retrieval, failed tools, partial outputs
- [ ] Visual distinction between high-confidence answers and best-guesses

#### Design System

- [ ] **Consistent component library** — extract all UI primitives into a shared system
- [ ] **Theme system** — dark/light/auto + custom themes with full color token support
- [ ] **Typography scale** — proper type hierarchy
- [ ] **Motion system** — consistent animation curves, durations, patterns
- [ ] **Density modes** — compact/comfortable/spacious
- [ ] **Responsive excellence** — designed for mobile, not just tolerant of it

#### Power User Features

- [ ] **Vim keybindings mode** — j/k navigation, / for search, : for commands
- [ ] **Custom keyboard shortcuts** — rebindable for all actions
- [ ] **Split view** — two conversations side by side
- [ ] **Floating windows** — pop out artifacts/terminal into separate windows
- [ ] **Quick switcher** — Cmd+K that searches conversations, agents, commands, settings in one place
- [ ] **Command bar** — slash commands with autocomplete and inline documentation
- [ ] **Zen mode** — full-screen, distraction-free writing with AI

#### Accessibility

- [ ] **WCAG 2.1 AA compliance** — screen reader support, keyboard navigation, focus management
- [ ] **High contrast mode**
- [ ] **Reduced motion** — respect `prefers-reduced-motion`
- [ ] **Screen reader announcements** — live regions for streaming messages, tool execution status
- [ ] **Focus trapping** — proper focus management in modals, command palette, dropdowns
- [ ] **Skip navigation** — skip to main content link

---

## Track D: Enterprise & Collaboration

### D1. Access Control & Teams

- [ ] **RBAC** — roles beyond admin flag: viewer, editor, admin, org-admin
- [ ] **SSO / SCIM** — WorkOS covers SSO, add SCIM for auto-provisioning
- [ ] **Model access policies** — restrict which models/tools specific roles can use
- [ ] **IP allowlisting** — restrict access by network
- [ ] **Session management** — view active sessions, force logout, timeout policies

### D2. Collaboration

- [ ] **Shared workspaces** — team spaces with shared conversations, agents, knowledge bases
- [ ] **Real-time collaboration** — multiple users in the same conversation simultaneously
- [ ] **Mentions** — @user to bring someone into a conversation
- [ ] **Comments on artifacts** — annotate generated code/documents with feedback
- [ ] **Approval workflows** — "AI generated this — does it look right?" with approve/reject
- [ ] **Activity feed** — see what your team is working on with AI

### D3. Compliance & Audit

- [ ] **Audit logging** — immutable log of who accessed/modified what, when, from where
- [ ] **Data residency** — control where data is stored (EU, US, etc.)
- [ ] **DLP (Data Loss Prevention)** — detect and block sensitive data in prompts (PII, credentials, proprietary code)
- [ ] **Compliance dashboard** — SOC2, HIPAA, GDPR readiness tracking
- [ ] **Data export** — full export for compliance requests (JSON, CSV)
- [ ] **Retention policies** — auto-delete conversations/artifacts after configurable period

### D4. Analytics

#### User-Facing

- [ ] **Usage dashboard** — messages sent, tokens used, cost breakdown by model/day/week
- [ ] **Productivity metrics** — code generated, documents created, time saved
- [ ] **Model comparison stats** — which models used most, satisfaction by model
- [ ] **Export everything** — full data export (JSON, CSV, Markdown) for conversations, artifacts, knowledge bases

#### Admin-Facing

- [ ] **Team usage overview** — who's using what, cost allocation by team/user
- [ ] **Model cost optimization** — suggestions for cheaper models that maintain quality
- [ ] **Feature adoption** — which features used, which ignored
- [ ] **Error rates** — per-model, per-tool failure rates with drill-down

---

## Testing & Quality Strategy

### Current State

```
Backend:   6 test files (security, tools, artifacts)
Frontend:  0 tests
E2E:       0 tests
Smoke:     0 tests
Load:      0 tests
Coverage:  ~15% backend, 0% frontend
```

### Target State

```
Backend:   >80% coverage
Frontend:  >60% coverage (component tests for all major UI)
E2E:       Critical path coverage
Smoke:     Pre-deploy validation suite
Load:      Baseline benchmarks + regression detection
```

---

### Backend Unit Tests

**Framework:** pytest + pytest-asyncio + coverage

- [ ] Add pytest, pytest-asyncio, and coverage tooling to pyproject.toml dev dependencies
- [ ] Ensure `uv run pytest` works from a fresh environment without guessing packages
- [ ] Test all services: agent loop, tool execution, RAG retrieval, sandbox lifecycle, auth, usage accounting
- [ ] Test all tools: call_api, web_browse, create_chart, run_sql, web_search, code execution
- [ ] Test all utilities: SSRF validation, redaction, rate limiting, token counting
- [ ] Test database models: CRUD operations, cascade deletes, constraint violations
- [ ] Test middleware: auth, CSRF, rate limiting, error handling, request ID propagation

---

### Backend Integration Tests

- [ ] Test API endpoints with a real test database (not mocks — internal competitor's lesson)
- [ ] Test auth flow end-to-end: login → JWT → refresh → protected endpoint
- [ ] Test SSE streaming: send message → receive token stream → verify message saved
- [ ] Test RAG pipeline: ingest document → create chunks → search → verify relevance
- [ ] Test sandbox lifecycle: create → execute code → read output → cleanup
- [ ] Migration validation: verify Alembic migrations apply cleanly to empty DB and from previous version

---

### Frontend Component Tests

**Framework:** Vitest + React Testing Library

- [ ] Message rendering (markdown, code blocks, KaTeX, citations, tool calls)
- [ ] Streaming state transitions (loading → streaming → complete → error)
- [ ] Artifact panels (chart rendering, table display, code view)
- [ ] Conversation tree behaviors (branching, navigation, selection)
- [ ] Auth/session flows (login, token refresh, logout, expired session)
- [ ] Command palette (open, search, execute, keyboard navigation)
- [ ] Chat input (text entry, file upload, model picker, slash commands)
- [ ] Sidebar (conversation list, pinning, search, delete)
- [ ] Form renderer (when create_ui ships — validate all field types, validation, submission)

---

### End-to-End Tests

**Framework:** Playwright

Critical user journeys:

- [ ] **Happy path:** Login → New conversation → Send prompt → Stream response → Verify message saved
- [ ] **Artifact flow:** Send prompt that triggers chart → Chart renders → Download PNG → Chart persisted
- [ ] **RAG flow:** Upload document → Create knowledge base → Chat with citations → Verify citations link to source
- [ ] **Sandbox flow:** Create sandbox → Execute Python code → View output in terminal → Read generated file
- [ ] **Agent flow:** Create agent persona → Start conversation with agent → Verify system prompt applies → Edit agent
- [ ] **Branching flow:** Send prompt → Regenerate → View tree panel → Navigate between branches
- [ ] **Multi-model compare:** Send prompt in compare mode → Verify parallel responses → Compare panel works
- [ ] **Error recovery:** Simulate LLM failure mid-stream → Verify graceful error message → Retry works

---

### Smoke Tests

Pre-deploy validation that runs in <60 seconds and catches catastrophic failures.

**Backend smoke suite:**
- [ ] Health endpoint responds 200 with all dependency checks passing
- [ ] Auth endpoints respond (login, token refresh)
- [ ] Chat endpoint accepts a message and returns SSE stream headers
- [ ] Database is reachable and schema version matches expected
- [ ] LLM proxy is reachable and responds to a simple completion
- [ ] Sandbox provider is reachable (Daytona health check)
- [ ] RAG search returns results (if knowledge bases exist)
- [ ] WebSocket endpoint accepts connections (terminal streaming)

**Frontend smoke suite:**
- [ ] App loads without console errors
- [ ] Login page renders
- [ ] After auth, main workspace renders with sidebar and chat
- [ ] Sending a message shows streaming response
- [ ] At least one artifact type renders correctly

**Post-deploy smoke (runs after every production deploy):**
- [ ] All backend smoke checks pass against production URL
- [ ] Frontend loads from production CDN
- [ ] A real message can be sent and streamed (against a cheap/fast model)
- [ ] Metrics endpoint is reporting data

---

### Load Tests

**Framework:** k6 (JavaScript-based, good for streaming) or Locust (Python-based, good for complex scenarios)

**Why k6 over Locust for us:** k6 handles SSE/WebSocket natively and our team already uses JavaScript. Locust is better if we want to share load test authoring with the Python backend team. Either works — pick one and commit.

#### Scenarios

1. **Concurrent chat streams**
   - Simulate N users each sending a message and consuming an SSE stream simultaneously
   - Measure: time to first token, stream throughput, error rate, server memory/CPU
   - Baseline: 50 concurrent streams without degradation
   - Target: 200+ concurrent streams

2. **Rapid message sends**
   - Single user sends 100 messages in quick succession
   - Verify: rate limiter kicks in correctly, no messages lost, no duplicate responses

3. **RAG under load**
   - N users simultaneously querying the same knowledge base
   - Measure: retrieval latency P50/P95/P99, relevance scores, database connection usage
   - Verify: pgvector doesn't become a bottleneck

4. **Sandbox concurrency**
   - N users creating sandboxes and executing code simultaneously
   - Measure: sandbox creation time, execution time, cleanup reliability
   - Verify: Daytona doesn't run out of resources, orphaned sandboxes don't accumulate

5. **WebSocket terminal load**
   - N users with open terminal sessions sending commands
   - Measure: command latency, connection stability, memory usage per connection

6. **Mixed workload**
   - Realistic traffic pattern: 60% chat, 20% RAG, 10% sandbox, 10% idle/browsing
   - Run for 30+ minutes to detect memory leaks, connection pool exhaustion, gradual degradation

7. **Spike test**
   - Ramp from 10 to 200 users in 30 seconds
   - Verify: system recovers gracefully, no cascading failures, rate limiting protects the backend

#### Load Test Infrastructure

- [ ] Run load tests in CI on a schedule (nightly or weekly) — not on every PR (too slow/expensive)
- [ ] Store results as benchmarks — fail if P95 latency regresses by >20%
- [ ] Generate reports with graphs (k6 cloud or Grafana integration)
- [ ] Test against staging environment (never production)

---

### Visual Regression Tests

**Framework:** Playwright screenshots + Percy or Chromatic

- [ ] Capture screenshots of key views: empty state, active conversation, artifact panel, command palette, sidebar, admin dashboard
- [ ] Compare against baseline on every PR
- [ ] Alert on unexpected visual changes

---

### Contract Tests

- [ ] Validate frontend API calls against backend OpenAPI schema
- [ ] Catch breaking changes before they reach users
- [ ] Auto-generate TypeScript types from OpenAPI spec (openapi-typescript)

---

### Fuzzing

- [ ] Fuzz tool inputs (call_api URLs, SQL queries, Vega-Lite specs, form schemas)
- [ ] Fuzz RAG queries (malformed queries, injection attempts, oversized inputs)
- [ ] Fuzz auth endpoints (malformed JWTs, expired tokens, CSRF bypass attempts)
- [ ] Fuzz file uploads (oversized files, malformed PDFs, zip bombs, path traversal filenames)

---

## Open Questions & Design Decisions

Items that need discussion or research before committing to an approach.

### 1. Redis vs Alternatives for Caching

**Context:** We need distributed caching for rate limiting, sessions, and query results. Redis is the obvious choice but adds infrastructure complexity.

**Options:**
- **Redis** — battle-tested, Railway has managed Redis, good Python/Node clients. Adds a dependency.
- **PostgreSQL advisory locks + materialized views** — no new infrastructure, but limited compared to Redis for rate limiting and session cache.
- **Valkey** — Redis fork, API-compatible, fully open source. Drop-in replacement if Redis licensing concerns arise.
- **In-memory with sync** — keep in-memory but sync state across instances via database. Fragile.

**Recommendation:** Redis via Railway. The operational overhead is minimal and it unlocks rate limiting, session cache, and pub/sub for real-time features later.

### 2. OpenTelemetry Collector vs Direct Export

**Context:** Should we run an OTel Collector sidecar or export traces/metrics directly to backends (Grafana Cloud, Datadog)?

**Considerations:**
- Collector adds deployment complexity but decouples instrumentation from backend choice
- Direct export is simpler for a small team but locks us into a specific vendor
- Railway supports sidecars but they're not free

**Recommendation:** Start with direct export to Grafana Cloud (free tier is generous). Add Collector when we need to fan out to multiple backends or do sampling/transformation.

### 3. Background Job Infrastructure

**Context:** Several features need background processing: scheduled tasks, cleanup jobs, long-running RAG ingestion, webhook processing.

**Options:**
- **Celery + Redis** — industry standard, complex setup, heavy
- **ARQ (async Redis queue)** — lightweight, async-native, fits our FastAPI stack
- **PostgreSQL-based (pgqueuer, procrastinate)** — no new infrastructure, good enough for moderate load
- **Custom with asyncio** — simple but not durable (jobs lost on restart)

**Recommendation:** Start with ARQ (async, Redis-backed, minimal). It fits our async-everything philosophy and Redis will already be deployed for caching. Migrate to Celery only if we need complex workflow orchestration.

### 4. Plugin/MCP Architecture

**Context:** Users need to add their own tools without modifying backend code. MCP (Model Context Protocol) is emerging as a standard.

**Questions:**
- Do we build our own plugin system or adopt MCP?
- How do we handle plugin security (sandboxing, permissions, secrets)?
- Where do plugins run (in our backend, in user's infrastructure, in a sandbox)?

**Recommendation:** Implement MCP client support first (connect to existing MCP servers). Then add our own plugin registry where users can define tools via UI (URL + auth + schema — essentially a generalized version of call_api). Full custom code plugins are a later concern.

### 5. Real-Time Collaboration Architecture

**Context:** Multi-user conversations need conflict resolution and real-time sync.

**Options:**
- **CRDTs (Yjs/Automerge)** — true real-time collaboration, complex, heavy
- **Operational Transforms** — proven (Google Docs), complex to implement
- **Last-write-wins with presence** — simple, good enough if collaboration is sequential (one person types at a time)
- **Turn-based** — users take turns, no conflict resolution needed

**Recommendation:** Start with turn-based + presence indicators (show who's viewing the conversation). Add last-write-wins for artifact editing. Full CRDT-based collaboration is a v2 concern and likely overkill for an AI chat tool where conversations are inherently sequential.

### 6. Data Residency & Multi-Region

**Context:** Enterprise customers will ask "where is my data stored?"

**Considerations:**
- Currently single-region on Railway
- Multi-region adds massive complexity (database replication, CDN, routing)
- Some customers will require EU-only or US-only

**Recommendation:** Defer multi-region until there's actual enterprise demand. Document current data residency clearly. When needed, deploy separate instances per region rather than building complex multi-region routing.

### 7. Offline / PWA Strategy

**Context:** Should Nexus work offline? PWA would allow installation as a desktop app.

**Considerations:**
- AI chat inherently requires network (LLM APIs are remote)
- But conversation history, artifacts, and settings could be cached locally
- PWA gives "app-like" experience without Electron
- Service Worker adds complexity and cache invalidation headaches

**Recommendation:** Add PWA manifest and basic Service Worker for app installation and static asset caching. Don't attempt offline message queueing — it's complex and the value is low when the core feature requires network. Focus on making the app installable and fast-loading.

### 8. Markdown Rendering Performance

**Context:** Shiki + KaTeX + marked all run in the browser. For long conversations with lots of code/math, this gets slow.

**Options:**
- **Web Worker** — offload all rendering to a worker, send HTML back to main thread
- **Server-side rendering** — pre-render markdown on the backend during streaming
- **Incremental rendering** — only render visible messages, lazy-render as user scrolls (pairs with virtual scrolling)
- **Caching** — cache rendered HTML per message (invalidate on theme change)

**Recommendation:** Combine Web Worker + incremental rendering. Move Shiki to a worker (it's the heaviest part). Only render messages in the viewport. Cache rendered HTML in memory. This is a meaningful performance win that should ship with virtual scrolling.

### 9. Agent Run Cost Controls

**Context:** An agent with tools can rack up significant costs if it loops (many tool calls, each triggering LLM calls).

**Questions:**
- What's the max cost per run? Per user per day?
- Should users see cost in real-time during a run?
- Should there be a "stop spending" button?

**Recommendation:** Add real-time cost display during agent runs (we already track token usage). Add configurable per-run and per-user-per-day cost limits. Show a warning at 80% of limit, hard-stop at 100%. Admin can configure limits per role.

---

## Initiative Sequence

The plan below is ordered by dependency, not by calendar. Each initiative should produce a stable layer that unlocks the next one. Within each initiative, the listed workstreams can be owned by different agents in parallel as long as they respect the stated dependencies.

### Initiative 1: Reliability Baseline

**Goal:** Establish a trustworthy shipping and operating foundation before adding major product surface area.

**Depends on:** None

**Parallel workstreams:**
- **Release engineering agent** — CI/CD pipeline, preview/staging/production environment parity, release versioning, rollback readiness, feature flags
- **Backend quality agent** — pytest setup, backend smoke suite, migration validation, Ruff, pre-commit, deterministic fixtures for agent runs
- **Frontend quality agent** — Vitest setup, frontend smoke suite, basic component test harness, build verification
- **Operations agent** — Sentry, tracing baseline, application metrics, log aggregation, alerting, release tagging
- **Runtime hardening agent** — timeout/retry policies, cancellation propagation, orphaned stream cleanup, defensive limits, cleanup jobs
- **Platform infra agent** — Redis for rate limiting/session cache, connection pool tuning, dependency scanning, secret scanning

**Definition of done:**
- A failing build cannot merge unnoticed
- A deploy can be verified and rolled back without ad hoc debugging
- The team can trace a major failure from user action to backend event

**Unlocks:** Initiatives 2, 3, and any customer-facing work that would otherwise be risky to ship

### Initiative 2: Remove Architectural Bottlenecks

**Goal:** Eliminate the current files and state containers that make new work expensive and regression-prone.

**Depends on:** Initiative 1

**Parallel workstreams:**
- **Backend refactor agent** — break up `backend/services/agent.py`, extract tool execution, retrieval orchestration, streaming mapping, usage accounting
- **Sandbox boundary agent** — create explicit sandbox service boundary for lifecycle, execution, filesystem, artifact discovery, terminal streaming
- **Frontend state agent** — split the global Zustand store into focused slices and formalize API state handling
- **Frontend component agent** — break up `chat-input.tsx`, `message-bubble.tsx`, `sidebar.tsx`, and reduce logic in `workspace.tsx`
- **UI resilience agent** — per-panel error boundaries and consistent error surfaces

**Definition of done:**
- No critical flow depends on a single "god file"
- Core runtime behavior is testable through small modules
- New features can be added without first untangling unrelated code

**Unlocks:** Initiatives 3-7

### Initiative 3: Standardize Platform Primitives

**Goal:** Define the shared contracts that all later product and extension work will rely on.

**Depends on:** Initiatives 1-2

**Parallel workstreams:**
- **Tool contract agent** — typed tool input/output contracts, timeout behavior, retry policy, logging, redaction, error classification
- **Event model agent** — structured event taxonomy for streaming, tools, retrieval, sandbox lifecycle, artifacts, user-visible errors
- **Artifact model agent** — artifact identity, lineage, versioning, persistence rules, source linking
- **Audit model agent** — append-only audit event schema for sensitive actions and admin-visible audit trails
- **Frontend request-state agent** — consistent request lifecycle model, optimistic update patterns, retry semantics, degraded-state UX

**Definition of done:**
- Tools, artifacts, runtime events, and audit events have stable schemas
- Frontend and backend share a clear contract for long-running executions
- Later features do not need bespoke event or artifact formats

**Unlocks:** Initiatives 4-9, especially legibility, memory, `create_ui`, MCP, and enterprise controls

### Initiative 4: Make Execution Legible

**Goal:** Turn the existing agent runtime into an understandable product surface before adding significantly more power.

**Depends on:** Initiative 3

**Parallel workstreams:**
- **Timeline agent** — execution timeline UI, reasoning summary, retrieval steps, tool calls, sandbox commands, durations, token usage
- **Provenance agent** — distinguish model answers, cited sources, retrieved context, artifacts, sandbox-generated files
- **Artifact center agent** — unified artifact center, search/filter, pinning, source conversation/message linking
- **Run comparison agent** — compare mode for runs, artifact versions, and alternate tool/model strategies
- **Uncertainty UX agent** — confidence markers, degraded-state indicators, post-run summaries, "what to review" and "what I'm uncertain about"

**Definition of done:**
- A user can inspect what the system did without reading logs
- Artifacts and outputs can be traced back to prompts, tools, and sources
- Branches and reruns are understandable, not hidden implementation detail

**Unlocks:** Initiatives 5-7 and stronger enterprise audit/compliance stories

### Initiative 5: Establish Durable Workspace Structure

**Goal:** Move from isolated chats to persistent working context that later memory and collaboration features can build on.

**Depends on:** Initiatives 3-4

**Parallel workstreams:**
- **Workspace agent** — reusable projects/workspaces, grouping conversations, knowledge bases, agents, preferred models
- **Organization agent** — full-text search, smart folders/tags, pinned messages/items, session continuity
- **Context controls agent** — context window visualization, pinned context, session memory controls, project vs conversation boundaries
- **Power UX agent** — quick switcher, command bar, keyboard-first navigation, split view where it fits the workspace model

**Definition of done:**
- Users can organize work into stable containers instead of loose conversations
- Search and navigation work across conversations and artifacts
- Context boundaries are explicit enough to support memory and access control later

**Unlocks:** Initiatives 6, 8, and 9

### Initiative 6: Add Trusted Memory and Knowledge Flows

**Goal:** Improve system intelligence only after the workspace, provenance, and control model are in place.

**Depends on:** Initiatives 4-5

**Parallel workstreams:**
- **Memory agent** — persistent AI memory, memory storage rules, retrieval/use policy, per-scope controls
- **Memory UX agent** — memory management UI, inspect/edit/delete flows, visibility into what is remembered and why
- **Knowledge UX agent** — citation UX overhaul, highlighted source passages, better retrieval usefulness signals
- **Structured data agent** — structured-data RAG, DuckDB-backed CSV/Excel analysis, schema preview, profiling, chart suggestions

**Definition of done:**
- Memory is visible, editable, scoped, and auditable
- Retrieval-backed answers expose evidence clearly
- Data workflows are useful without becoming opaque or magical

**Unlocks:** Initiatives 7-9

### Initiative 7: Add Interactive and Applied Workflows

**Goal:** Build richer interfaces and execution ergonomics on top of stable event, artifact, and workspace primitives.

**Depends on:** Initiatives 3-6

**Parallel workstreams:**
- **`create_ui` agent** — JSON-schema form tool, renderer, submission flow, artifact persistence, structured response handling
- **Artifact viewer agent** — richer viewers, diffs, version rollback, chart editing, notebook-style data views
- **Coding workflow agent** — file tree diffs, command history, save/restore checkpoints, inspect-before-apply, revert controls
- **Data workflow agent** — table transforms, notebook-style replay, report-builder flows, approval/review interfaces
- **Input modalities agent** — vision input, file intelligence, and selected high-value multimodal affordances that reuse existing primitives

**Definition of done:**
- The AI can produce interactive workflows without bespoke implementations each time
- Applied coding/data tasks feel first-class rather than bolted on
- Interactive outputs still preserve provenance, auditability, and reversibility

**Unlocks:** Initiative 8 and higher-end product differentiation

### Initiative 8: Open the Platform

**Goal:** Expose stable extension points only after internal runtime and tool abstractions have settled.

**Depends on:** Initiatives 1-7

**Parallel workstreams:**
- **Jobs agent** — background job infrastructure, durable task state, cleanup/scheduled execution support, webhook processing
- **MCP agent** — MCP client support, connection management, permissions model, operator visibility
- **Plugin registry agent** — user-defined tools via UI, auth/schema management, safe execution boundaries
- **Integration agent** — first-party integrations (for example GitHub, Slack) built on the same extension model
- **Automation agent** — scheduled tasks, external triggers, notifications, admin controls

**Definition of done:**
- New tools and automations can be added without changing core backend code each time
- Extension mechanisms inherit the same contracts, auditability, and security posture as built-in tools

**Unlocks:** Initiative 9 and future ecosystem/product platform work

### Initiative 9: Team, Enterprise, and Governance Layer

**Goal:** Make the product safe and manageable for shared organizational use.

**Depends on:** Initiatives 3-8

**Parallel workstreams:**
- **Access control agent** — RBAC, model/tool access policies, session management, IP allowlisting
- **Shared workspace agent** — team workspaces, shared conversations, artifact comments, approvals, activity feed
- **Compliance agent** — immutable audit logging, retention policies, data export, DLP, residency posture/documentation
- **Admin analytics agent** — team usage overview, cost allocation, feature adoption, error-rate drill-down, compliance dashboard

**Definition of done:**
- Multiple users can safely share context and outputs
- Admins can answer who did what, with what data, and at what cost
- Enterprise controls build on existing workspace and audit primitives instead of bypassing them

**Unlocks:** Initiative 10 and enterprise go-to-market readiness

### Initiative 10: Frontier Differentiators

**Goal:** Pursue expensive, high-upside differentiators only after the foundation and platform are stable.

**Depends on:** Initiatives 4-9

**Parallel workstreams:**
- **Multi-agent agent** — multi-agent orchestration, best-of-N workflows, merge/adopt flows, explainable differences
- **Agent builder agent** — visual agent builder and higher-level workflow authoring
- **Realtime collaboration agent** — deeper collaboration primitives beyond shared workspaces when justified
- **Voice/multimodal agent** — full voice conversation mode, screen/video capture, sketch input
- **Polish agent** — accessibility audit/remediation, visual regression suite, fuzzing, advanced performance optimization

**Definition of done:**
- Differentiators feel like multipliers on a strong core, not unstable demos
- Advanced capabilities still preserve reliability, legibility, and governance

**Cross-Initiative Rules**

- Do not open extension points before tool/event/audit contracts are stable
- Do not ship persistent memory before users can inspect, scope, and delete it
- Do not add shared/team features before workspace boundaries and audit events are defined
- Do not prioritize frontier interaction modes over legibility of existing execution
- Each initiative should end with a documented release checklist, telemetry coverage, and regression protection appropriate to the surface area it adds

---

## Success Metrics

Track these to know when we've arrived:

| Metric | Current (est.) | 90-Day Target | World-Class Target |
|--------|---------------|---------------|-------------------|
| Time to first token | ~1-3s | <800ms | <500ms (with caching) |
| P95 page load | Unknown | <2s | <1.5s |
| Test coverage (backend) | ~15% | >50% | >80% |
| Test coverage (frontend) | 0% | >30% | >60% |
| Lighthouse performance | Unknown | >80 | >90 |
| Lighthouse accessibility | Unknown | >85 | >95 |
| MTTR | Unknown (no monitoring) | <1hr | <15min |
| Deploy frequency | Manual | Weekly | Multiple per day |
| Error rate | Unknown | <1% | <0.1% |
| Concurrent streams | ~50 (est.) | 200 | 1000+ |
| Smoke test time | N/A | <60s | <30s |
| E2E suite time | N/A | <5min | <3min |

---

## Guiding Principle

Nexus should not try to win by becoming a bigger generic AI app.

It should win by becoming the most trustworthy and legible environment for doing real work with AI:

- Better operational reliability than AI prototypes
- Better workflow depth than generic chat apps
- Better execution transparency than black-box agents
- Better artifacts than text-only assistants
- Better extensibility than walled-garden products

That is the path from "pretty decent tool" to "gold standard."

---

## Implementation Log

All 10 initiatives were structurally implemented on 2026-03-24/25. Each produced atomic commits. A verification pass on 2026-03-25 fixed linting, type errors, unmounted components, and missing integrations — release gate is now fully green (ruff, mypy, tsc, eslint, build, 222 tests).

| # | Initiative | Commit | Key Deliverables |
|---|-----------|--------|-----------------|
| 1 | Reliability Baseline | `a6af9c3` | CI/CD (GitHub Actions), 145 backend + 77 frontend tests, OpenTelemetry + Prometheus metrics, circuit breakers, retry policies, Redis integration, background cleanup |
| 2 | Architectural Bottlenecks | `5537a8f` | agent.py → agent/ package, chat-input.tsx → 10 files, message-bubble.tsx → 9 files, sidebar.tsx → 5 files, workspace.tsx → 4 files, Zustand store → 8 slices, per-panel error boundaries |
| 3 | Platform Primitives | `af479b1` | 11 tool contracts, artifact model (type/source/lineage/versioning), audit event system + DB table, request lifecycle types, useApi/useOptimistic hooks |
| 4 | Execution Legibility | `3cbea6d` | ExecutionTimeline, ProvenanceIndicator, RunSummary, ConfidenceIndicator components |
| 5 | Workspace Structure | `3cbea6d` | Project model + CRUD API, full-text search API + SearchPanel, ProjectSwitcher, ContextWindowViz |
| 6 | Memory & Knowledge | `4c31dd0` | Memory model + CRUD API + service, MemoryPanel, CitationDetailPanel/Popover |
| 7 | Interactive Workflows | `4c31dd0` | create_ui tool (10 field types), FormRenderer, ArtifactCenter, SSE integration |
| 8 | Open Platform | `3030539` | Background job system, MCP client, plugin registry, Jobs + Integrations APIs |
| 9 | Enterprise & Governance | `3030539` | RBAC (4 roles), compliance API (audit log, data export), admin analytics |
| 10 | Frontier Differentiators | `570dbfa` | Multi-agent orchestration, accessibility (SkipNav, LiveRegion, FocusTrap, reduced-motion), RunComparison |

### Notes from implementation

- **Redis fallback**: All Redis-dependent features (rate limiting, caching) gracefully fall back to in-memory when Redis is unavailable. This means the dev experience doesn't require Redis running.
- **Tool contracts**: The 11 registered contracts cover all existing tools. New tools should use `register_tool()` to ensure consistent timeout/retry/redaction behavior.
- **Audit events**: Events are buffered in memory and flushed to DB in batches of 50. The `record_audit_event()` function always logs immediately regardless of buffer state.
- **RBAC backward compatibility**: The new `role` field coexists with `is_admin`. The RBAC system checks `role` first, falls back to `is_admin`-based role inference.
- **create_ui forms**: V1 uses JSON-schema forms injected as user messages on submission. The plan's V2 (dedicated endpoint) and V3 (sandboxed iframe) paths remain future work.
- **MCP client**: Implements the basic tool discovery + execution protocol. Full MCP spec compliance (resources, prompts, sampling) is future work.
- **Multi-agent**: The orchestration layer supports 4 strategies but the actual parallel execution reuses existing `run_multi_agent_loop`. Deep multi-step debate/merge is future work.
- **Migrations**: 4 new Alembic migrations added (audit_events, projects, memories, user roles). Run `alembic upgrade head` to apply.
- **Audit wiring**: Audit events are recorded for conversation/agent/KB CRUD, sandbox creation, user login, and document uploads. Buffer flushes on shutdown.
- **Memory in agent runtime**: The agent loop retrieves relevant memories before each LLM call and prepends them to the system prompt.
- **RBAC coverage**: Permission guards on destructive endpoints (delete conversation/agent/KB). Compliance and admin analytics require admin+ role. Broader coverage is incremental.
- **UI components mounted**: ExecutionTimeline, RunSummary, ConfidenceDot, ProvenanceRow in message-bubble; ArtifactCenter and MemoryPanel as right-panel tabs; RunComparison in streaming-bubble for multi-model compare.
- **Plugin registry**: Currently in-memory; production use requires DB-backed persistence (future work).
- **create_ui field types**: V1 supports 10 types (text, textarea, number, select, multiselect, checkbox, radio, date, slider, rating). datetime, file, and table are deferred to V2.
- **Staging/production deploy, preview deployments, security scanning, performance budgets**: CI structure exists but CD workflows are deferred until Railway deployment config is finalized.
- **Smoke/E2E suites**: Not yet implemented. Backend and frontend unit/component test coverage is the current quality gate.
