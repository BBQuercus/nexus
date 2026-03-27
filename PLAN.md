# Nexus — Unified Plan

**Last updated:** 2026-03-27
**Goal:** Build the most trustworthy and legible environment for doing real work with AI.

> Nexus wins not by becoming a bigger generic AI app, but by being the most transparent, reliable, and extensible AI workspace. Better operational reliability than prototypes. Better workflow depth than chat apps. Better execution transparency than black-box agents. Better artifacts than text-only assistants. Better extensibility than walled gardens.

---

## Current State

| Area | Score | Notes |
|------|-------|-------|
| Architecture | 9/10 | Next.js 15 + FastAPI + PostgreSQL, fully async, clean separation |
| Type Safety | 9/10 | Strict TypeScript, Pydantic, SQLAlchemy Mapped types |
| Feature Depth | 9/10 | RAG, sandboxes, agents, artifacts, branching, multi-model compare, TTS, charts, SQL, web browse, forms, multi-org |
| Security | 9/10 | All 5 critical issues fixed (WS auth, CSRF rotation, CSP, admin rate limit, error sanitization) |
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

## Completed (reference)

- **Tier 0:** shadcn/ui migration, Sonner toasts
- **Tier 1:** All security fixes (S1-S5), password reset, file upload limits/progress
- **Tier 2 Reliability:** Timeouts, SSE keepalive, audit flush, LLM retries, token refresh
- **Tier 2 DX:** Alembic cleanup, model catalog endpoint, railway.toml gitignore, Prettier, pre-commit frontend, seed data, gitignore cleanup
- **Tier 2 UX:** Offline banner, toast dedup, rename icon + escape cancel
- **Tier 3 Foundation:** Multi-org (schema, RLS, org switcher, JWT), in-memory rate limiter removed, FastAPI docs hidden in production

---

## Tier 2: Ship Next (active)

### Reliability

| # | Issue | Status |
|---|-------|--------|
| R5 | Conversation tree loaded via parent_id — O(n) recursive | Deferred — needs migration + tree UI testing |

### Developer Experience

| # | Issue | Status |
|---|-------|--------|
| D2 | API response caching | Partial — TanStack Query installed; per-route caching still TODO |
| D11 | No CONTRIBUTING.md | TODO |

### User Experience

#### User Preferences
Add toggles in the user dropdown (no dedicated page yet):
- Theme (dark/light/system)
- Font size (small/medium/large)
- Reduce animations (respects `prefers-reduced-motion` as default)

Persist to a `user_settings` table (jsonb) to avoid cross-device/localStorage issues.

#### Draft Auto-Save
Save composer draft to localStorage per conversation (keyed by conversation ID), debounced on input change. Restore when returning to that conversation. Clear on send.

#### Feature Discoverability
- First-use tooltips for 3-4 high-value features: command palette, conversation branching, slash commands, KB attachment. Track "seen" state server-side in `user_settings`.
- Show keyboard shortcut hints inline (e.g., "Cmd+K" next to command palette trigger)
- Make slash commands discoverable with inline hints in the composer

#### Conversation Management
- Sort options (recent, alphabetical, most messages)
- Show conversation count
- Bulk mode: multi-select with "select all", bulk delete. New feature — needs UI + batch endpoint.

#### Search Expansion
Expand from title-only to:
- Full-text search of message content via PostgreSQL FTS (`tsvector`/`tsquery`). Add GIN index on messages table.
- Sort options (relevance vs date)
- Preserve scope selection across searches

#### Message Actions
- 5-second undo window for message deletes: delay API call, show toast with undo button. Fire delete on `beforeunload` if timer is still pending.

---

## Tier 3: Build Out (Features, Testing, Infrastructure)

### 3.1 Features

#### Temporary / Private Chat
Conversations that aren't persisted or auto-delete after session ends.

**Data model:**
- Add `retention` column to conversations: `permanent` (default), `session`, `24h`, `7d`, `30d`
- `session` conversations deleted on logout or after 1h of inactivity
- Timed conversations cleaned up by background job (ARQ)
- Excluded from search indexes, minimize retained metadata

**UX:**
- Toggle in conversation menu or composer header: "Temporary conversation" with retention picker
- Temp conversations shown in sidebar with subtle indicator (clock icon / dimmed), grouped separately
- On creation, brief tooltip: "This conversation will be deleted after [duration]"

**Backend:**
- `DELETE FROM conversations WHERE retention != 'permanent' AND expires_at < NOW()` — ARQ job, runs every 15 min
- `expires_at` computed column: `created_at + retention_interval`
- Cascade delete: messages, artifacts, attachments
- Staleness alert at 2× expiry to Teams webhook
- Audit keeps only minimal metadata (no message content)

#### Admin Usage Dashboard & Soft Limits
`UsageLog` table and `llm_service.calculate_cost()` already exist.

**Admin page:** User/tokens/cost/model breakdown table, filterable by period, exportable as CSV.

**Soft limits:** $50/mo per user (hardcoded). "Approaching limit" banner at 80%.

**In-conversation:** Real-time cost display during agent runs. Warning when a single run exceeds $2.

#### Conversation Sharing & Export
Audit events defined but no endpoints exist:
- Share conversation via link (with optional expiry)
- Export as Markdown/PDF
- Export all artifacts as bundle

#### Bulk Operations
Batch endpoints for delete multiple conversations, agents, knowledge bases.

#### API Versioning
Prefix all endpoints with `/api/v1/` before expanding admin/sharing/org-scoped surface area. Clean cutover, no parallel unversioned aliases.

#### Streaming Cancellation
Client-initiated abort mid-generation. Client cancels → backend cancels LLM call → cleanup. Terminal stop — does not resume automatically.

#### Model Allowlisting per Org
**Dependency:** Multi-org ✅

Admin sets which models are available per org.
- `org_allowed_models` table: `org_id`, `model_id`, `enabled`
- No rows = all models available (opt-in restriction)
- `GET /api/models` filters by current org's allowlist

#### System Prompt per Org
**Dependency:** Multi-org ✅

- `organizations.system_prompt` — text field, nullable
- Injected before user/agent-level system prompts
- Admin UI: textarea in org settings with preview

#### Audit Log Export & Retention
**Dependency:** Multi-org ✅

- `GET /api/admin/audit-log` — paginated, filterable by user/event type/date range, exportable as JSON/CSV
- Admin-configurable retention period per org (default: 1 year)
- ARQ job purges events older than retention period
- Immutable during retention window

#### Frontend Performance
- Route-level code splitting (knowledge, agents, admin pages)
- Optimistic UI updates for conversation deletes, message sends
- Virtual scrolling for long conversations (react-window)
- Web Worker for Shiki syntax highlighting
- Image lazy loading
- Multi-tab conflict resolution

#### Mobile Improvements
- Swipe gestures for sidebar open/close
- Auto-collapse right panel on mobile
- Mobile-appropriate shortcut references
- Command palette close hint

#### Accessibility
- Wire skip-nav into root layout
- Error boundary announces to screen readers
- Keyboard navigation for tree panel, artifact center
- Proper ARIA labels on FormRenderer radio/checkbox groups
- `aria-label` on all icon-only buttons
- Streaming messages announce via live regions
- Apply `prefers-reduced-motion` globally
- Streaming images get alt text
- Focus trap consistently on modals

#### OAuth Error Handling
Switch login errors from `window.location.hash` to query parameters.

### 3.2 Testing

**Current:** 173 backend + 82 frontend tests. Coverage floor: 40% backend, ~15% frontend.
**Target:** >60% backend, >40% frontend, critical path E2E, coverage gating in CI.

#### Backend (expand)
- Auth flow end-to-end: login → JWT → refresh → protected endpoint → expiry
- SSE streaming round-trip
- RAG pipeline: ingest → chunk → search → verify relevance
- Sandbox lifecycle: create → execute → read output → cleanup
- Migration rollback: Alembic up + down on clean DB
- Redis failure scenarios: rate limit fallback, session fallback
- CSRF rotation, WebSocket auth with expired tokens
- Tool contracts: timeout behavior, retry, redaction
- Fuzz auth endpoints and file uploads

#### Frontend (expand)
- Auth provider + session flows
- Streaming state transitions (loading → streaming → complete → error)
- API client (useApi, error handling, retry)
- Form renderer (all field types, validation, submission)
- Conversation tree behaviors
- Command palette keyboard navigation

#### E2E Tests (Playwright)
Critical journeys:
- Login → New conversation → Send prompt → Stream response → Verify saved
- Upload document → Create KB → Chat with citations
- Create sandbox → Execute code → View output
- Create agent → Start conversation → Verify system prompt
- Send prompt → Regenerate → Navigate branches
- Multi-model compare → Verify parallel responses
- Error recovery: simulate LLM failure mid-stream → graceful message → retry

#### Visual Regression + Accessibility
- Playwright screenshots vs. baseline on every PR
- axe-core in Playwright E2E suite on critical views

### 3.3 Infrastructure

| # | Issue | Status |
|---|-------|--------|
| I1 | Monitor workflow doesn't trigger alerts on failure | TODO |
| I3 | OTEL configured but observability wiring is incomplete | TODO |
| I4 | Dependabot enabled but no auto-merge strategy | TODO |
| I8 | No health check documentation | TODO |

### 3.4 Tech Debt

| # | Issue | Status |
|---|-------|--------|
| C1 | Dual DB engine (separate pgvector connection) | TODO |
| C2 | Legacy `_list_conversations_legacy()` | TODO |
| C5 | Streaming state duplication | TODO |
| C6 | Plugin registry is in-memory | TODO |

---

## Tier 4: Future Vision

Directional only — don't start until Tiers 1-3 are solid.

### Workspace & Memory
- Reusable projects with persistent context, files, tools, preferred models
- Persistent AI memory across conversations (visible, editable, scoped, auditable)
- Context window visualization
- Session continuity — "Continue where I left off"

### Execution Legibility
- Execution timeline: reasoning summary, tool calls with timing, token usage
- Provenance UI: model answer vs cited source vs retrieved context vs artifact
- Post-run summaries: "what I did", "what to review", "what I'm uncertain about"
- Rerun from any step, compare two runs side by side

### Artifact System
- Unified artifact center with search/filter across conversations
- Artifact lineage — trace back to prompt, tool call, data source
- Live updates with version history and diff view
- Richer viewers: notebook-style data view, chart editing, file diff

### Enterprise & Collaboration
- RBAC beyond admin flag: viewer, editor, admin, org-admin
- Shared workspaces with team conversations, agents, KBs
- Approval workflows, comments on artifacts
- SCIM for auto-provisioning into orgs (WorkOS covers SSO)

### Platform Extensibility
- MCP client support (full spec compliance)
- User-defined tools via UI (URL + auth + schema)
- Background job infrastructure for scheduled tasks, webhooks
- First-party integrations (GitHub, Slack, Teams)

### Interactive UI Platform (`create_ui` evolution)
- v2: Dedicated form submission endpoint (decouple from "inject as user message" hack)
- v3: Sandboxed iframe for custom dashboards — AI generates full HTML/JS, rendered in isolated iframe with `sandbox="allow-scripts"`, postMessage communication

### Frontier
- Multi-agent orchestration
- Visual agent builder (drag-and-drop)
- Full voice conversation mode
- Image generation integration (DALL-E, Flux)
- Model routing — auto-select best model based on task type

---

## Decisions Made

| # | Decision | Choice |
|---|----------|--------|
| 1 | Frontend query caching | **TanStack Query** — SSR-aware, rich devtools, mutation handling |
| 2 | Background job framework | **ARQ** — async, Redis-backed, lightweight, fits FastAPI stack |
| 3 | Real-time collaboration | **Turn-based + presence indicators** first. CRDT is overkill |
| 4 | E2E test environment | **Local containerized** — dedicated test DB, mock LLM, seeded test user via `just seed` |
| 5 | OTEL export | **Use existing Grafana stack** — wire into current infra |
| 6 | `create_ui` evolution | v2 + v3 in Tier 4 |
| 7 | Multi-org data model | **PostgreSQL RLS** — `org_id` on all tables |
| 8 | Alerting destination | **Single Teams webhook** for now |
| 9 | Temporary chat audit posture | Keep content private and short-lived, retain minimal metadata |
| 10 | Streaming cancellation semantics | Hard stop for that run; no automatic resume |
| 11 | API versioning timing | Add `/api/v1` before broadening admin/sharing/org-scoped surface |
| 12 | Bulk operations approach | Generic batch-operation infrastructure |
| 13 | RLS connection strategy | **`SET LOCAL`** within transactions |
| 14 | Backend caching | **Redis with TTL + invalidate-on-write** — model catalog (5 min), conversation list (2 min), KB list (2 min), user profile (5 min) |
| 15 | Streaming cancellation tier | **Tier 3 only** — full implementation |
| 16 | Temp chat cleanup monitoring | **Staleness alert** at 2× expiry to Teams webhook |

---

## Priority Sequence

**Dependency graph:**
- **API versioning** → large new endpoint expansion (do before sharing/audit/org features)
- **Baseline metrics** (P95 page load, Lighthouse a11y, error rate) → performance/UX optimization work
- **Streaming cancellation** — full implementation in Tier 3, terminal stop semantics

---

## Success Metrics

| Metric | Current | Next Target | World-Class Aim |
|--------|---------|-------------|-----------------|
| Security issues open | **0** ✅ | 0 | 0 |
| Test coverage (backend) | ~40% (floor enforced) | >60% | >80% meaningful behavior |
| Test coverage (frontend) | ~15% (v8 configured) | >40% | >60% real flows |
| E2E test coverage | Smoke/basic | Critical paths | All major flows |
| Time to first token | ~1-3s | <800ms | <500ms |
| P95 page load | **Measure** | <2s | <1.5s |
| Lighthouse accessibility | **Measure** | >85 | >95 |
| Error rate | **Measure** | <1% | <0.1% |
| Deploy frequency | git push to main | Weekly | Multiple/day |
