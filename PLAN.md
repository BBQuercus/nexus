# Nexus — Unified Plan

**Last updated:** 2026-03-26 (progress updated)
**Goal:** Build the most trustworthy and legible environment for doing real work with AI.
**Sources:** Codebase audit, UX/DX friction audit, prior master plan, implementation log.

> Nexus wins not by becoming a bigger generic AI app, but by being the most transparent, reliable, and extensible AI workspace. Better operational reliability than prototypes. Better workflow depth than chat apps. Better execution transparency than black-box agents. Better artifacts than text-only assistants. Better extensibility than walled gardens.

---

## Current State

| Area | Score | Notes |
|------|-------|-------|
| Architecture | 9/10 | Next.js 15 + FastAPI + PostgreSQL, fully async, clean separation |
| Type Safety | 9/10 | Strict TypeScript, Pydantic, SQLAlchemy Mapped types |
| Feature Depth | 9/10 | RAG, sandboxes, agents, artifacts, branching, multi-model compare, TTS, charts, SQL, web browse, forms, multi-org |
| Security | 9/10 | ~~5 critical issues~~ → all fixed (WS auth, CSRF rotation, CSP, admin rate limit, error sanitization) |
| Streaming | 8/10 | Token-by-token SSE with 15s keepalive ping; cancellation still TODO |
| Error Handling | 9/10 | Sanitized error messages, no internal service leaks, user-friendly fallbacks |
| UI Polish | 8/10 | shadcn/ui primitives, Sonner toasts, offline banner, rename icons, dark/light theme |
| Testing | 7/10 | 173 backend + 82 frontend tests, coverage floor at 40% backend, pre-commit hooks for frontend |
| CI/CD | 7/10 | GitHub Actions pipeline exists, deploy workflows in progress |
| Observability | 6/10 | OTEL + Prometheus configured but no collector connected, no alerting |
| Caching | 6/10 | Redis available, TanStack Query provider installed, backend cache utilities ready |
| Accessibility | 4/10 | Components exist (skip-nav, live-region, focus-trap) but not wired up consistently |

**Overall: 8/10** — Security hardened, reliability improved, multi-org shipped, DX tooling in place. Remaining: observability wiring, accessibility, and Tier 3 features.

---

## Tier 0: Foundation ✅

### 0.1 Migrate to shadcn/ui ✅ DONE

Replaced hand-rolled primitives with shadcn/ui (Radix-based). Toast migrated to Sonner. All components themed with project design tokens.

---

## Tier 1: Fix Now (Security & Critical UX) ✅

### 1.1 Security Fixes ✅ ALL DONE

| # | Issue | Status |
|---|-------|--------|
| S1 | WebSocket auth doesn't check token type — refresh tokens bypass short TTL | ✅ Fixed: WS query param auth rejects refresh tokens |
| S2 | CSRF token never rotates — derived from `user_id + server_secret` | ✅ Fixed: CSRF bound to JWT `iat` + `org_id`, rotates on refresh |
| S3 | CSP allows `unsafe-eval` + `unsafe-inline` | ✅ Fixed: Removed `unsafe-eval`, added `frame-ancestors 'none'`, security headers on Next.js |
| S4 | No rate limit on admin API | ✅ Fixed: 60 req/min per user on admin routes |
| S5 | Error messages leak internal model names/routing details | ✅ Fixed: Sanitization middleware, no service names in responses |

### 1.2 Password Reset Flow ✅ DONE

POST `/auth/forgot-password` triggers WorkOS password reset. "Forgot password?" link on login page.

### 1.3 File Upload Limits & Progress ✅ DONE

File size validation (25MB documents, 100MB data files) on file input, paste, and drag-drop. Toast errors for oversized files.

---

## Tier 2: Ship Next (Reliability, DX, Core UX)

Work that makes the product trustworthy and pleasant to use day-to-day.

### 2.1 Reliability & Performance

| # | Issue | Status |
|---|-------|--------|
| R1 | No request timeout middleware | ✅ Done: 30s default, 180s streaming |
| R2 | SSE streaming has no heartbeat/ping | ✅ Done: 15s keepalive ping |
| R3 | Audit buffer is in-memory only | ✅ Done: Flush on each write |
| R4 | LLM retry: only 1 retry with 2s flat backoff | ✅ Done: 4 retries with 1s/2s/4s/10s backoff |
| R5 | Conversation tree loaded via parent_id — O(n) recursive | Deferred — needs migration + tree UI testing |
| R7 | Token refresh hardcoded to 30 min | ✅ Done: Uses backend `exp`, silent refresh on 401 before redirect |

### 2.2 Developer Experience

| # | Issue | Status |
|---|-------|--------|
| D1 | Dual migration system (Alembic + raw ALTER TABLE) | ✅ Done: Removed raw ALTER TABLE from startup |
| D2 | No API response caching | ✅ Partial: TanStack Query provider installed; backend cache utilities ready; per-route caching TODO |
| D3 | Manual snake/camel case mapping | Skipped — openapi-typescript risky for now |
| D4 | Model catalog duplicated | ✅ Done: `GET /api/models` endpoint serves catalog from backend |
| D5 | Railway config swapping | ✅ Done: `railway.toml` in `.gitignore` |
| D6 | No frontend formatter | ✅ Done: `.prettierrc` + `just format-frontend` |
| D7 | Pre-commit covers backend only | ✅ Done: Frontend lint + typecheck in pre-commit hooks |
| D8 | No dev seed data | ✅ Done: `just seed` with test user + sample data |
| D9 | Landing prompts use DOM events | TODO — functional as-is, low priority |
| D11 | No CONTRIBUTING.md | TODO |
| D12 | Generated artifacts not ignored | ✅ Done: `reports/` and `railway.toml` in `.gitignore` |
| D13 | Inconsistent migration naming | Convention documented in CLAUDE.md |

### 2.3 User Experience — Core Improvements

#### User Preferences
Add toggles directly in the user dropdown (no dedicated page yet — not enough settings to justify one):
- Theme (dark/light/system)
- Font size (small/medium/large)
- Reduce animations (respects `prefers-reduced-motion` as default)

Persist to a `user_settings` table (jsonb) to avoid cross-device/localStorage issues. Expand to a dedicated settings page later when more preferences accumulate.

#### Toast Improvements ✅ DONE
Migrated to Sonner. Built-in dedup, auto-dismiss, and rate-limiting.

#### Draft Auto-Save
Save composer draft to localStorage per conversation (keyed by conversation ID), debounced on input change. Restore when returning to that conversation. Clear on send.

#### Offline Experience ✅ DONE
"You're offline" banner when connection is lost, auto-dismisses on reconnect.

#### Feature Discoverability
- First-use tooltips for 3-4 high-value features: command palette, conversation branching, slash commands, KB attachment. Track "seen" state server-side in `user_settings`.
- Show keyboard shortcut hints inline (e.g., "Cmd+K" next to command palette trigger)
- Make slash commands discoverable with inline hints in the composer

#### Conversation Management
- Sort options (recent, alphabetical, most messages)
- Show conversation count
- ✅ Visible rename icon on hover (pencil icon)
- ✅ Escape during rename cancels the edit
- Bulk mode: multi-select with "select all", bulk delete. New feature — needs UI + batch endpoint.

#### Search Expansion
Currently title-only. Expand to:
- Full-text search of message content via PostgreSQL FTS (`tsvector`/`tsquery`). Add GIN index on messages table.
- Sort options (relevance vs date)
- Preserve scope selection across searches

#### Message Actions
- 5-second undo window for message deletes: delay API call, show toast with undo button. Fire delete on `beforeunload` if timer is still pending.
- No toasts for copy (checkmark is enough)

---

## Tier 3: Build Out (Features, Testing, Infrastructure)

### 3.1 Features to Add

#### Multi-Org Foundation ✅ DONE
Shipped in one pass: schema with `org_id` on all tables, RLS policies, `SET LOCAL` per transaction, org switcher in frontend, JWT carries `org_id`, auto-bootstrap personal workspace for existing users, superadmin bypass, org-scoped admin routes.

#### Temporary / Private Chat
Conversations that aren't persisted or auto-delete after session ends.

**Data model:**
- Add `retention` column to conversations: `permanent` (default), `session`, `24h`, `7d`, `30d`
- `session` conversations deleted on logout or after 1h of inactivity
- Timed conversations cleaned up by background job (ARQ)
- Temp conversations get `org_id` like everything else (RLS still applies), are excluded from search indexes, and minimize retained metadata

**UX:**
- Toggle in conversation menu or composer header: "Temporary conversation" with retention picker
- Default retention: `session`
- Temp conversations shown in sidebar with a subtle indicator (clock icon / dimmed) and grouped separately
- No auto-save of drafts for temp conversations (the point is no persistence)
- On creation, brief tooltip: "This conversation will be deleted after [duration]"
- Explain clearly that content is temporary, but minimal security/billing metadata may still be retained

**Backend:**
- `DELETE FROM conversations WHERE retention != 'permanent' AND expires_at < NOW()` — scheduled ARQ job, runs every 15 min
- `expires_at` computed column: `created_at + retention_interval`
- Cascade delete: messages, artifacts, attachments all cleaned up
- **Staleness alert:** If any conversation exceeds 2× its `expires_at`, emit a warning to the Teams webhook. Catches silently broken cleanup jobs without overengineering
- Exclude from `CONVERSATION_SHARED` / `CONVERSATION_EXPORTED` endpoints
- Audit/events keep only minimal metadata: conversation existed, actor, timestamps, retention mode, token/cost usage. Do not retain message content, attachments, or retrieved context.

#### Admin Usage Dashboard & Soft Limits
`UsageLog` table and `llm_service.calculate_cost()` already exist — this adds visibility and guardrails.

**Admin page:**
- Table: user, tokens used, cost, model breakdown, period (day/week/month)
- Sortable, filterable, exportable as CSV
- Query layer on existing `UsageLog` table — no new data collection needed

**Soft limits:**
- $50/mo per user (hardcoded for now, configurable later)
- "Approaching limit" banner at 80%, don't cut off

**In-conversation:**
- Real-time cost display during agent runs (token counter + estimated cost via `llm_service.calculate_cost()`)
- Warning when a single run exceeds $2

#### Conversation Sharing & Export
Audit events `CONVERSATION_SHARED` / `EXPORTED` are already defined but no endpoints exist. Add:
- Share conversation via link (with optional expiry)
- Export as Markdown/PDF
- Export all artifacts as bundle

#### Bulk Operations
Add batch endpoints for delete multiple conversations, agents, knowledge bases. Currently forces N individual requests.

#### API Versioning
Prefix all endpoints with `/api/v1/` soon, before expanding admin/sharing/org-scoped surface area. Do a clean cutover rather than maintaining parallel unversioned aliases.

#### Streaming Cancellation Endpoint
Client-initiated abort mid-generation. Propagate: user cancels → backend cancels LLM call → cleanup resources. Cancellation is terminal for that run: once stopped, it does not resume automatically and must be re-run explicitly by the user.

#### Conversation Templates / Quick Starts (parked)
Deferred — not enough user signal yet to know which templates are useful. Revisit after launch.

#### Model Allowlisting per Org
Admin sets which models are available per org. Users pick from the allowed set. Important for compliance (some orgs may only approve certain providers).

**Dependency:** Requires Multi-Org Foundation first.

**Data model:**
- `org_allowed_models` table: `org_id`, `model_id`, `enabled` (boolean)
- If no rows exist for an org, all models are available (opt-in restriction)
- `GET /api/models` filters by current org's allowlist
- Frontend model picker only shows allowed models — no client-side filtering

#### System Prompt per Org
Org-level default instructions prepended to every conversation's system prompt.

**Dependency:** Requires Multi-Org Foundation first.

**Data model:**
- `organizations.system_prompt` — text field, nullable
- Injected by agent runtime before user/agent-level system prompts
- Precedence: org prompt → agent persona prompt → user message
- Admin UI: textarea in org settings, with preview of how it composes with agent prompts
- Example: "You are an assistant for Acme Corp. Our tech stack is Python/React. Follow our coding standards at [internal link]. Never share proprietary code outside the platform."

#### Audit Log Export & Retention
Audit events are recorded but can't be exported or auto-purged.

**Dependency:** Org scoping depends on Multi-Org Foundation first.

**Export:**
- `GET /api/admin/audit-log` — paginated, filterable by user, event type, date range
- Export as JSON or CSV
- Filter: "show me everything user X did in the last 90 days"
- Scoped by org (RLS enforced)

**Retention:**
- Admin-configurable retention period per org (default: 1 year)
- ARQ background job purges events older than retention period
- Immutable during retention window — no manual deletion

#### Org-Scoped API Keys (parked)
Not important now. Keep on radar for when orgs want to script against Nexus (automated reports, CI integrations, Slack bots).

#### Granular Knowledge Base Permissions
KBs are currently either private or public (readable by anyone). Add:
- Private KBs (owner-only, current default)
- Shared KBs (visible to specific users/roles/teams)
- Organization-scoped KBs (visible to all members of an org)
- Multi-org considerations: KBs must be org-scoped at the storage level — a KB shared within Org A must never leak to Org B.

#### Frontend Performance
- Route-level code splitting (knowledge, agents, admin pages shouldn't load upfront)
- Optimistic UI updates for conversation deletes, message sends
- Multi-tab conflict resolution (state desync awareness)
- Image lazy loading
- Virtual scrolling for long conversations (react-window)
- Web Worker for Shiki syntax highlighting (heaviest computation)

#### Mobile Improvements
- Swipe gestures for navigation (sidebar open/close)
- Auto-collapse right panel on mobile
- Mobile-appropriate shortcut references (not desktop Cmd keys)
- Command palette shouldn't cover full screen without close hint

#### Accessibility
- Wire skip-nav into root layout
- Error boundary announces to screen readers
- Keyboard navigation for tree panel, artifact center
- Proper ARIA labels on FormRenderer radio/checkbox groups
- `aria-label` on all icon-only buttons (not just `title`)
- Streaming messages announce to screen readers via live regions
- Apply `prefers-reduced-motion` media query globally
- Streaming images get alt text
- Focus trap consistently on modals

#### OAuth Error Handling
Switch login errors from `window.location.hash` to query parameters (current approach is non-standard and invisible to SSR).

### 3.2 Testing Strategy

**Current:** 173 backend + 82 frontend tests, pre-commit hooks for frontend, coverage floor at 40% backend.
**Target:** >60% backend, >40% frontend, critical path E2E, coverage gating in CI.

#### Backend Tests (expand — "scavenger hunt" for hidden bugs)
- Set coverage floor (40% initially, ramp to 60%)
- Test auth flow end-to-end: login → JWT → refresh → protected endpoint → expiry
- Test SSE streaming round-trip (not just unit tests)
- Test RAG pipeline: ingest → chunk → search → verify relevance
- Test sandbox lifecycle: create → execute → read output → cleanup
- Test migration rollback: Alembic up + down on clean DB
- Test Redis failure scenarios: rate limit fallback, session fallback
- Test CSRF rotation, WebSocket auth with expired tokens
- Test tool contracts: timeout behavior, retry, redaction
- Fuzz auth endpoints (malformed JWTs, expired tokens, CSRF bypass)
- Fuzz file uploads (oversized, malformed PDFs, path traversal filenames)

#### Frontend Tests
- Auth provider + session flows
- Streaming state transitions (loading → streaming → complete → error)
- API client (useApi, error handling, retry)
- Form renderer (all field types, validation, submission)
- Conversation tree behaviors
- Command palette keyboard navigation

#### E2E Tests (Playwright)
Use a dummy test user (seeded via `just seed`). Ensure safety by:
- Dedicated test database or test user namespace
- Cleanup after each test run
- No access to production data or real LLM keys (mock LLM responses)
- CI runs against a containerized test environment

Critical journeys:
- Login → New conversation → Send prompt → Stream response → Verify saved
- Upload document → Create KB → Chat with citations
- Create sandbox → Execute code → View output
- Create agent → Start conversation → Verify system prompt
- Send prompt → Regenerate → Navigate branches
- Multi-model compare → Verify parallel responses
- Error recovery: simulate LLM failure mid-stream → graceful message → retry

#### Visual Regression Tests
Playwright screenshots of key views, compared against baseline on every PR.

#### Accessibility Audits
Add axe-core to Playwright E2E suite. Run on critical views.

### 3.3 Infrastructure & DevOps

| # | Issue | Status |
|---|-------|--------|
| I1 | Monitor workflow doesn't trigger alerts on failure | TODO |
| I2 | Frontend quality checks not enforced in hooks | ✅ Done: eslint + tsc in pre-commit |
| I3 | OTEL configured but observability wiring is incomplete | TODO |
| I4 | Dependabot enabled but no auto-merge strategy | TODO |
| I5 | Backend coverage `fail_under: 0` — no enforcement | ✅ Done: Floor at 40% |
| I6 | Frontend has no coverage config | ✅ Done: v8 provider configured in vitest |
| I7 | FastAPI docs exposed at `/docs` in production | ✅ Done: `docs_url=None` when `ENVIRONMENT=production` |
| I8 | No health check documentation | TODO |

### 3.4 Cleanup & Tech Debt

| # | Issue | Status |
|---|-------|--------|
| C1 | Dual DB engine (separate pgvector connection) | TODO |
| C2 | Legacy `_list_conversations_legacy()` | TODO |
| C3 | In-memory `RateLimiter` class (sync) | ✅ Done: Removed — only async Redis-backed remains |
| C4 | Unused audit event types | Keep — org audit events now in use |
| C5 | Streaming state duplication | TODO |
| C6 | Plugin registry is in-memory | TODO |

---

## Tier 4: Future Vision

Bigger plays that build on the hardened foundation. These are directional — don't start until Tiers 1-3 are solid.

### Workspace & Memory
- Reusable projects/workspaces with persistent context, files, tools, preferred models
- Persistent AI memory across conversations (visible, editable, scoped, auditable)
- Memory management UI — view, edit, delete what the AI remembers
- Context window visualization — show what's included, what's truncated
- Session continuity — "Continue where I left off" with context summary

### Execution Legibility
- Execution timeline: reasoning summary, tool calls with timing, token usage
- Provenance UI: distinguish model answer vs cited source vs retrieved context vs artifact
- Post-run summaries: "what I did", "what to review", "what I'm uncertain about"
- Rerun from any step, branch from any message, compare two runs side by side

### Artifact System
- Unified artifact center with search/filter across conversations
- Artifact lineage — trace back to prompt, tool call, data source
- Live updates with version history and diff view
- Richer viewers: notebook-style data view, chart editing, file diff

### Enterprise & Collaboration
- RBAC beyond admin flag: viewer, editor, admin, org-admin (per org via `user_orgs.role`)
- Shared workspaces with team conversations, agents, KBs (org-scoped)
- Approval workflows, comments on artifacts
- SSO/SCIM (WorkOS covers SSO, add SCIM for auto-provisioning into orgs)

### Platform Extensibility
- MCP client support (full spec compliance: resources, prompts, sampling)
- User-defined tools via UI (URL + auth + schema)
- Background job infrastructure for scheduled tasks, webhooks, cleanup
- First-party integrations (GitHub, Slack, Teams) built on extension model

### Interactive UI Platform (`create_ui` evolution)
- v1 (shipped): JSON-schema forms rendered inline in chat
- v2: Dedicated form submission endpoint (decouple from "inject as user message" hack)
- v3: Sandboxed iframe for custom dashboards/apps — AI generates full HTML/JS, rendered in isolated iframe with `sandbox="allow-scripts"`, postMessage communication. Reuses existing sandbox preview infra. Unlocks: live dashboards, calculators, multi-step wizards, approval interfaces

### Frontier
- Multi-agent orchestration — multiple agents on complex tasks, not just 1:1 chat
- Visual agent builder (drag-and-drop workflow authoring)
- Full voice conversation mode
- Image generation integration (DALL-E, Flux)
- Model routing — auto-select best model based on task type

---

## Decisions Made

| # | Decision | Choice |
|---|----------|--------|
| 1 | Frontend query caching | **TanStack Query** — SSR-aware, rich devtools, mutation handling. Roll out app-wide once adequate test coverage is in place |
| 2 | Background job framework | **ARQ** — async, Redis-backed, lightweight, fits FastAPI stack |
| 3 | Real-time collaboration | **Turn-based + presence indicators** first. CRDT is overkill for sequential chat |
| 4 | E2E test environment | **Local containerized** — dedicated test DB, mock LLM, seeded test user via `just seed` |
| 5 | OTEL export | **Use the existing Grafana stack**. Wire OTEL/metrics/alerts into current infrastructure rather than adding Grafana Cloud |
| 6 | `create_ui` evolution | v2 (dedicated endpoint) + v3 (sandboxed iframe) stay on roadmap in Tier 4 |
| 7 | Multi-org data model | **PostgreSQL RLS** — `org_id` on all tables, RLS policies enforce isolation, impossible to leak cross-org |
| 8 | Alerting destination | **Single Teams webhook** for now, split into per-channel routing later |
| 9 | Temporary chat audit posture | Keep content private and short-lived, but retain minimal metadata for security/billing/compliance |
| 10 | Streaming cancellation semantics | Cancellation is a hard stop for that run; no automatic resume |
| 11 | API versioning timing | Add `/api/v1` before broadening admin/sharing/org-scoped API surface |
| 12 | Bulk operations approach | Prefer generic batch-operation infrastructure where it stays legible and safe |
| 13 | Alert routing | Teams is sufficient for now as the attention path |
| 14 | Multi-org rollout | **Ship in one pass** — schema, RLS, org switcher together. No phasing. Nuke DB and start clean (no existing user data) |
| 15 | RLS connection strategy | **`SET LOCAL`** within transactions — safe with future connection poolers. Currently SQLAlchemy async pool only, no external pooler |
| 16 | Backend caching | **Redis with TTL + invalidate-on-write** — model catalog (5 min), conversation list (2 min), KB list (2 min), user profile (5 min). Both replicas share Redis |
| 17 | Tier gates | **No hard gates** — dependency graph only. Any item can start if its dependencies are met |
| 18 | Streaming cancellation tier | **Tier 3 only** — full implementation (client → backend → cancel LLM → cleanup), not a lightweight Tier 2 version |
| 19 | Temp chat cleanup monitoring | **Staleness alert** at 2× expiry to Teams webhook. No dead-letter queue or complex retry |

---

## Priority Sequence

Tiers indicate rough priority, not hard gates. Any item can be started as long as its dependencies are satisfied. Within a tier, order doesn't matter — parallelize freely.

**Dependency graph (updated — completed items struck through):**
- ~~**shadcn/ui migration (Tier 0)** — do first~~ ✅
- ~~**Security fixes (S1-S5)** — do first~~ ✅
- ~~**Multi-org foundation**~~ ✅ → org-scoped allowlists, org prompts, org budgets, org-scoped audit export, granular KB permissions
- **API versioning** → large new endpoint expansion
- **Baseline metrics** (P95 page load, Lighthouse a11y, error rate) → performance/UX optimization work
- **Streaming cancellation** — full implementation in Tier 3 with terminal stop semantics

---

## Success Metrics

Principle: aim for world-class quality bars, but measure outcomes rather than chasing superficial tests. Prefer meaningful coverage of critical logic, regressions, and user journeys over testing low-value boilerplate.

| Metric | Current | Next Target | World-Class Aim |
|--------|---------|-------------|-----------------|
| Security issues open | **0** ✅ | 0 | 0 |
| Test coverage (backend) | ~40% (floor enforced) | >60% | >80% where it reflects meaningful behavior, not boilerplate |
| Test coverage (frontend) | ~15% (v8 configured) | >40% | >60% where it reflects real flows and state transitions |
| E2E test coverage | Smoke/basic | Critical paths | All major flows |
| Time to first token | ~1-3s | <800ms | <500ms |
| P95 page load | **Measure** | <2s | <1.5s |
| Lighthouse accessibility | **Measure** | >85 | >95 |
| Error rate | **Measure** | <1% | <0.1% |
| Deploy frequency | git push to main | Weekly | Multiple/day |
