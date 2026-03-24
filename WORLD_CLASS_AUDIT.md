# Nexus — World-Class Audit & Roadmap

**Date:** 2026-03-24
**Goal:** Build the de-facto gold standard AI chat application in 2026.
**Benchmark:** Compared against internal competitor (internal corporate tool) and the broader landscape (ChatGPT, Claude.ai, Cursor, Typingmind, OpenWebUI, LibreChat).

---

## Part 1: Current State Assessment

### What Nexus Already Does Well

| Area | Details | Score |
|------|---------|-------|
| **Architecture** | Next.js 15 + FastAPI + PostgreSQL, fully async, clean separation | 9/10 |
| **Type Safety** | Strict TypeScript, Pydantic models everywhere, SQLAlchemy Mapped types | 9/10 |
| **Security** | SSRF protection, CSRF tokens, CSP headers, auth redaction, sandbox access control | 8/10 |
| **Streaming** | Token-by-token SSE, artifact streaming, tool execution progress | 8/10 |
| **Feature Depth** | RAG, sandboxes, agents, artifacts, branching, multi-model compare, TTS | 8/10 |
| **Error Handling** | Global middleware, request IDs, structlog, frontend error reporting | 8/10 |
| **UI Polish** | Dark theme, animations, command palette, keyboard shortcuts, responsive | 7/10 |
| **Code Quality** | Consistent patterns, async everywhere, good DB schema design | 8/10 |
| **Testing** | 6 backend test files (security, tools, artifacts) | 3/10 |
| **CI/CD** | None | 0/10 |
| **Observability** | Structured logging only, no tracing/metrics | 3/10 |
| **Caching** | None (in-memory rate limiter only) | 2/10 |

**Overall: 7.5/10** — Production-ready for small teams, but missing the infrastructure and polish that separates good from legendary.

---

### internal competitor Comparison (Why It Falls Short)

internal competitor scores roughly **4/10** overall. Key failures:

- **Zero test coverage** — No pytest, vitest, or any testing framework installed
- **97% unpinned dependencies** — `requirements.txt` with no lockfile, guaranteed breakage over time
- **Security vulnerabilities** — Azure Speech API key baked into frontend JS bundle, prompt injection in RAG (documents injected into system prompt without sanitization), wildcard CORS (`allow_methods=["*"]`), no CSP headers, timing attack on admin token comparison
- **N+1 query hell** — Message retrieval loops fetch chunks per message (51 DB queries for 50 messages)
- **DB polling anti-pattern** — Google Search confirmation polls database every second for 60 seconds
- **Monolithic components** — `Main.tsx` (974 lines, 25+ state variables), `ChatInterface.tsx` (1013 lines) — untestable, un-splittable
- **No observability** — Health endpoint returns static "UP" without checking any dependencies
- **Mixed icon libraries** — 6 different icon sets (io5, im, fa6, tb, md, fi) creating visual chaos
- **No dark mode** — Partial implementation for one component only
- **Blocking async** — Synchronous DB calls inside async functions block the event loop
- **Native browser dialogs** — `window.confirm()` instead of styled modals
- **No connection pooling** — Database connections created per-request

What internal competitor does have that's worth noting:
- Visual agent builder (drag-and-drop node editor) — interesting UX concept
- Clean backend architecture pattern (models → repos → services → controllers)
- Comprehensive file processing (8+ formats including audio transcription)
- Custom exception hierarchy (21 exception types)

---

## Part 2: The Gold Standard — What It Looks Like in 2026

The best AI chat application in 2026 isn't just a wrapper around LLM APIs. It's an **operating system for thought** — a place where people do their most important work, with AI as a collaborator rather than a chatbot. Here's what that means concretely.

---

### 2.1 Core Experience

#### Conversation Intelligence
- [ ] **Full-text search** across all conversations, messages, and artifacts with instant results
- [ ] **Smart folders / tags** — Auto-categorize conversations by topic, project, or custom tags
- [ ] **Pinned messages** within conversations — bookmark the important parts
- [ ] **Conversation templates** — Start from a template (code review, data analysis, writing, brainstorm)
- [ ] **Session continuity** — "Continue where I left off" with context summary when returning to old conversations
- [ ] **Conversation forking** — Branch exists in the tree panel, but make it discoverable inline: "Try this with a different approach" button on any message
- [ ] **Cross-conversation context** — Reference or link between conversations ("as we discussed in [conversation]")

#### Message-Level Power
- [ ] **Copy as markdown/code/plain text** — One-click copy with format selection
- [ ] **Share a single message** — Generate a shareable link to one message or artifact
- [ ] **Message annotations** — Add notes to AI responses (corrections, context, tags)
- [ ] **Inline editing** — Edit any previous message and regenerate from that point (not just the last one)
- [ ] **Diff view** — When regenerating, show what changed between versions
- [ ] **Message threading** — Reply to a specific message within the conversation (nested threads)

#### Multi-Modal First Class
- [ ] **Vision input** — Paste/drag screenshots, photos, diagrams → route to vision-capable models automatically
- [ ] **Image generation** — Integrated image gen (DALL-E, Flux, Stable Diffusion) with inline preview
- [ ] **Voice mode** — Full voice conversation mode (not just TTS), with wake word and continuous listening
- [ ] **Video/screen capture** — Record screen or camera, send frames to vision model for analysis
- [ ] **Handwriting/sketch input** — Draw diagrams or write by hand on tablet, AI interprets
- [ ] **File intelligence** — Drop any file type and get smart analysis (not just RAG ingestion — actual understanding)

#### Model Management
- [ ] **Model comparison 2.0** — Side-by-side with diff highlighting, auto-scoring, cost comparison
- [ ] **Model routing** — Auto-select best model based on task type (code → Claude, creative → GPT, fast → Haiku)
- [ ] **Model favorites & defaults** — Per-agent, per-conversation, per-task-type defaults
- [ ] **Custom model endpoints** — Add your own OpenAI-compatible endpoints (Ollama, vLLM, local models)
- [ ] **Model performance dashboard** — Track latency, quality ratings, cost per model over time
- [ ] **Prompt caching awareness** — Show when prompt cache hits, estimated savings

---

### 2.2 Knowledge & RAG

#### RAG 2.0
- [ ] **Semantic search UI** — Show relevance scores, highlight matching passages in source documents
- [ ] **Citation UX** — Clickable citations that open the source document at the exact passage
- [ ] **Auto-reranking** — Enable Cohere/cross-encoder reranking by default with quality metrics
- [ ] **Hybrid retrieval tuning** — User-adjustable vector vs BM25 weighting
- [ ] **Document versioning** — Update documents without losing conversation history references
- [ ] **Incremental ingestion** — Add pages to existing knowledge bases without re-processing everything
- [ ] **Web knowledge bases** — Crawl and index websites as knowledge bases
- [ ] **Structured data RAG** — Query CSV/Excel/databases with natural language (text-to-SQL)

#### Memory & Context
- [ ] **Persistent memory** — AI remembers user preferences, past decisions, project context across conversations
- [ ] **Memory management UI** — View, edit, delete what the AI remembers about you
- [ ] **Project workspaces** — Group conversations, knowledge bases, agents, and artifacts under projects
- [ ] **Context window visualization** — Show how much context is used, what's included, what's been truncated

---

### 2.3 Agents & Tools

#### Agent Framework
- [ ] **Visual agent builder** — Drag-and-drop workflow nodes (internal competitor has this concept — do it better)
- [ ] **Agent marketplace** — Share and discover community agents
- [ ] **Agent versioning** — Track changes to agent prompts, rollback to previous versions
- [ ] **Agent analytics** — Per-agent usage stats, satisfaction ratings, common failure modes
- [ ] **Multi-agent orchestration** — Chain agents together, route tasks between specialists
- [ ] **Agent guardrails** — Set boundaries on what agents can do (budget limits, tool restrictions, output validation)

#### Tool Ecosystem
- [ ] **Plugin/MCP architecture** — Let users add tools without modifying backend code
- [ ] **Built-in integrations** — GitHub, Jira, Slack, Notion, Google Drive, Confluence, Linear
- [ ] **SQL tool** — Connect to databases, run queries, visualize results (with read-only safety)
- [ ] **API builder** — Create custom API integrations through a UI (method, URL, headers, auth, body template)
- [ ] **Scheduled tasks** — Run agents on a cron schedule (daily report, weekly summary, monitoring)
- [ ] **Webhooks** — Trigger conversations from external events (new Jira ticket, Slack mention, GitHub PR)

#### Code Execution
- [ ] **Multi-language sandboxes** — Python, JS, TypeScript, Go, Rust, SQL — all with package installation
- [ ] **Persistent environments** — Keep sandbox state between messages (installed packages, files, variables)
- [ ] **Collaborative notebooks** — Jupyter-like interface for iterative data exploration
- [ ] **Artifact evolution** — Iterate on generated code/charts/documents with version history
- [ ] **One-click deploy** — Deploy generated apps/APIs to a hosted environment
- [ ] **Git integration** — Clone repos into sandbox, make changes, create PRs

---

### 2.4 UI/UX Excellence

#### Performance
- [ ] **Virtual scrolling** — Chat history and sidebar must handle 10,000+ items without lag
- [ ] **Optimistic UI** — Messages appear instantly, sync in background
- [ ] **Skeleton loading** — Content-aware loading states (not spinners)
- [ ] **Prefetching** — Preload likely-needed data (next conversation, recent artifacts)
- [ ] **Web Workers** — Offload markdown parsing, syntax highlighting, search indexing to workers
- [ ] **Service Worker** — Offline support, background sync, push notifications

#### Design System
- [ ] **Consistent component library** — Extract all UI primitives into a design system
- [ ] **Theme system** — Dark/light/auto + custom themes with full color token support
- [ ] **Typography scale** — Proper type hierarchy (not just Tailwind defaults)
- [ ] **Motion system** — Consistent animation curves, durations, and patterns
- [ ] **Density modes** — Compact/comfortable/spacious for different screen sizes and preferences
- [ ] **Responsive excellence** — Not just "works on mobile" but "designed for mobile"

#### Accessibility
- [ ] **WCAG 2.1 AA compliance** — Screen reader support, keyboard navigation, focus management
- [ ] **High contrast mode** — For users with visual impairments
- [ ] **Reduced motion mode** — Respect `prefers-reduced-motion`
- [ ] **Screen reader announcements** — Live regions for streaming messages, tool execution status
- [ ] **Focus trapping** — Proper focus management in modals, command palette, dropdowns
- [ ] **Skip navigation** — Skip to main content link

#### Power User Features
- [ ] **Vim keybindings mode** — j/k navigation, / for search, : for commands
- [ ] **Custom keyboard shortcuts** — Rebindable shortcuts for all actions
- [ ] **Split view** — Two conversations side by side
- [ ] **Floating windows** — Pop out artifacts/terminal into separate windows
- [ ] **Quick switcher** — Cmd+K but smarter — search conversations, agents, commands, settings all in one
- [ ] **Command bar** — Slash commands with autocomplete and inline documentation
- [ ] **Zen mode** — Full-screen, distraction-free writing with AI

---

### 2.5 Data & Analytics

#### User Analytics
- [ ] **Usage dashboard** — Messages sent, tokens used, cost breakdown by model/day/week
- [ ] **Productivity metrics** — Code generated, documents created, time saved estimates
- [ ] **Model comparison stats** — Which models you use most, satisfaction by model
- [ ] **Export everything** — Full data export (JSON, CSV, Markdown) for all conversations, artifacts, knowledge bases

#### Admin Analytics
- [ ] **Team usage overview** — Who's using what, cost allocation by team/user
- [ ] **Model cost optimization** — Suggestions for cheaper models that maintain quality
- [ ] **Feature adoption** — Which features are used, which are ignored
- [ ] **Error rates** — Per-model, per-tool failure rates with drill-down

---

### 2.6 Collaboration

- [ ] **Shared workspaces** — Team spaces with shared conversations, agents, knowledge bases
- [ ] **Real-time collaboration** — Multiple users in the same conversation simultaneously
- [ ] **Mentions** — @user to bring someone into a conversation
- [ ] **Comments on artifacts** — Annotate generated code/documents with feedback
- [ ] **Approval workflows** — "AI generated this — does it look right?" with approve/reject
- [ ] **Activity feed** — See what your team is working on with AI

---

### 2.7 Enterprise & Security

- [ ] **RBAC** — Roles beyond admin flag: viewer, editor, admin, org-admin
- [ ] **SSO / SCIM** — WorkOS covers SSO, add SCIM for auto-provisioning
- [ ] **Audit logging** — Immutable log of who accessed/modified what, when, from where
- [ ] **Data residency** — Control where data is stored (EU, US, etc.)
- [ ] **DLP (Data Loss Prevention)** — Detect and block sensitive data in prompts (PII, credentials, proprietary code)
- [ ] **Model access policies** — Restrict which models/tools specific roles can use
- [ ] **Compliance dashboard** — SOC2, HIPAA, GDPR readiness tracking
- [ ] **IP allowlisting** — Restrict access by network
- [ ] **Session management** — View active sessions, force logout, session timeout policies

---

## Part 3: Infrastructure & Engineering Excellence

### 3.1 Testing Strategy

```
Current:  6 backend test files, 0 frontend tests, 0 E2E tests
Target:   >80% backend coverage, component tests for all UI, E2E for critical paths
```

- [ ] **Backend unit tests** — pytest with async support for all services, tools, and utilities
- [ ] **Backend integration tests** — Test API endpoints with test database (not mocks)
- [ ] **Frontend component tests** — Vitest + React Testing Library for all major components
- [ ] **E2E tests** — Playwright for critical user journeys:
  - Login → New conversation → Send message → Receive response → Create artifact
  - RAG: Upload document → Create knowledge base → Chat with citations
  - Sandbox: Execute code → View output → Iterate
  - Agent: Create persona → Use in conversation → Edit
- [ ] **Visual regression tests** — Playwright screenshots for UI consistency
- [ ] **Load testing** — k6 or Locust for concurrent streaming connections
- [ ] **Contract tests** — API schema validation between frontend and backend
- [ ] **Fuzzing** — Fuzz tool inputs, RAG queries, and auth endpoints

### 3.2 CI/CD Pipeline

```
Current:  Nothing
Target:   Full GitHub Actions pipeline with staging + production
```

- [ ] **PR checks** — Lint (ruff + eslint), type check (mypy + tsc), test (pytest + vitest), build
- [ ] **Staging deploy** — Auto-deploy to staging on PR merge to `develop`
- [ ] **Production deploy** — Manual approval gate, deploy on merge to `main`
- [ ] **Database migrations** — Auto-run Alembic migrations in CI with rollback plan
- [ ] **Dependency scanning** — Dependabot/Renovate for automated updates
- [ ] **Security scanning** — Snyk/Trivy for vulnerability detection in dependencies and Docker images
- [ ] **Performance budgets** — Fail CI if bundle size exceeds threshold
- [ ] **Preview deployments** — Unique URL per PR for visual review

### 3.3 Observability Stack

```
Current:  structlog to stdout
Target:   Full observability (traces, metrics, logs, alerts)
```

- [ ] **Distributed tracing** — OpenTelemetry across frontend → API → LLM → sandbox
- [ ] **Application metrics** — Prometheus/Grafana for latency, error rates, token usage
- [ ] **Error tracking** — Sentry for both frontend and backend
- [ ] **Log aggregation** — Structured logs shipped to central store (Loki, Datadog)
- [ ] **Alerting** — PagerDuty/Slack alerts for error spikes, latency degradation, LLM failures
- [ ] **Synthetic monitoring** — Scheduled health checks from external locations
- [ ] **Real User Monitoring (RUM)** — Track actual user performance (Core Web Vitals)
- [ ] **Cost monitoring** — Track LLM API spend in real-time with budget alerts

### 3.4 Caching & Performance

```
Current:  No caching, in-memory rate limiter
Target:   Multi-layer caching, distributed rate limiting
```

- [ ] **Redis** — Distributed rate limiting, session cache, frequently-accessed data
- [ ] **Query result caching** — Cache user's agent personas, knowledge base metadata, settings
- [ ] **Embedding cache** — Cache embeddings for frequently-searched documents
- [ ] **CDN** — Static assets (JS, CSS, images) served from edge
- [ ] **Database query optimization** — Query analysis, missing indexes, connection pool tuning
- [ ] **LLM response caching** — Cache identical prompts (with TTL) for cost savings
- [ ] **Frontend bundle optimization** — Code splitting per route, tree shaking, lazy imports

### 3.5 Code Quality

- [ ] **Break up monoliths**:
  - `chat-input.tsx` (1378 lines) → Split into: InputField, FileUploader, ModelPicker, AgentPicker, KBPicker, VoiceInput
  - `message-bubble.tsx` (820 lines) → Split into: MessageContent, ToolCallDisplay, CitationList, MessageActions, BranchIndicator
  - `agent.py` (766 lines) → Split into: AgentLoop, ToolExecutor, StreamHandler, BranchManager
  - `sidebar.tsx` (443 lines) → Split into: ConversationList, ConversationItem, SidebarActions, PinnedItems
- [ ] **Python linting** — Add `ruff check` and `ruff format` to pre-commit and CI
- [ ] **Pre-commit hooks** — lint-staged + husky for frontend, pre-commit for Python
- [ ] **API documentation** — Auto-generated OpenAPI docs (FastAPI provides this — expose it)
- [ ] **Architecture decision records (ADRs)** — Document why decisions were made
- [ ] **Error boundary improvements** — Per-panel error boundaries (chat, sidebar, right panel) so one crash doesn't kill the whole app

---

## Part 4: Competitive Analysis — What Others Do That We Don't

### ChatGPT (OpenAI)
- Canvas mode (collaborative document editing with AI)
- Memory across conversations (persistent user context)
- Custom GPTs marketplace
- Voice mode with emotion detection
- Deep research (multi-step autonomous research)
- Scheduled tasks ("remind me", "every Monday")

### Claude.ai (Anthropic)
- Artifacts (we have this — ours is competitive)
- Projects with persistent instructions and files
- Extended thinking (visible reasoning chains)
- MCP integrations (standardized tool protocol)
- Styles (adjustable response personality)

### Cursor
- Codebase-wide context (index entire repos)
- Multi-file editing in one operation
- Terminal integration with AI
- Git-aware suggestions
- Apply-to-codebase for generated code

### TypingMind
- Plugin system (custom JavaScript tools)
- Prompt library with variables
- Multiple chat profiles
- Local-first (runs without server)
- Character/persona marketplace

### Open WebUI
- Extensive model management (Ollama integration)
- RAG with web search
- Pipelines (custom middleware)
- Community model/prompt sharing
- Multi-user with granular permissions

### What Nobody Does Well Yet (Opportunity)
- **True multi-agent workflows** — Not just chat with one agent, but orchestrating multiple agents on complex tasks
- **AI-native project management** — Conversations that become tasks, decisions that become documentation
- **Institutional memory** — AI that actually learns from your organization's patterns over time
- **Audit & compliance** — Enterprise-grade logging that satisfies SOC2/HIPAA without sacrificing UX
- **Developer-extensible everything** — API-first design where every feature is also an API endpoint

---

## Part 5: Priority Roadmap

### Phase 1: Foundation (Weeks 1-3)
*Make what exists bulletproof*

1. CI/CD pipeline (GitHub Actions: lint, test, build, deploy)
2. Redis caching layer (rate limiting, sessions, query cache)
3. Ruff linting + pre-commit hooks
4. Break up the 4 largest files (chat-input, message-bubble, agent, sidebar)
5. Virtual scrolling for chat and sidebar
6. Error tracking (Sentry)

### Phase 2: Power User UX (Weeks 4-6)
*Make daily usage addictive*

7. Full-text conversation search with instant results
8. Message-level actions (copy, share, annotate, export)
9. Smart folders / tags / conversation organization
10. Theme system (dark/light/auto + custom)
11. Keyboard-first navigation (vim bindings, full keyboard control)
12. Inline conversation branching UX
13. Vision input (paste/drag images → vision models)

### Phase 3: Knowledge & Intelligence (Weeks 7-9)
*Make the AI actually smart about your data*

14. Persistent memory (cross-conversation context)
15. Memory management UI
16. Citation UX overhaul (clickable, highlighted source passages)
17. Structured data RAG (text-to-SQL for CSV/Excel/databases)
18. Project workspaces (group conversations + KBs + agents)
19. Context window visualization

### Phase 4: Tools & Extensibility (Weeks 10-12)
*Make it the platform, not just the app*

20. MCP/plugin architecture for custom tools
21. Built-in integrations (GitHub, Slack, Jira, Notion)
22. SQL tool with database connections
23. Scheduled tasks / agent automation
24. Webhooks for external triggers
25. API builder UI for custom integrations

### Phase 5: Collaboration & Enterprise (Weeks 13-16)
*Make it team-ready*

26. RBAC (roles beyond admin flag)
27. Shared workspaces with team conversations
28. Audit logging
29. DLP (sensitive data detection in prompts)
30. Admin dashboard overhaul (team usage, cost allocation, model optimization)
31. Compliance readiness (SOC2 controls)

### Phase 6: Polish & Differentiation (Weeks 17-20)
*Make it legendary*

32. Multi-agent orchestration
33. Visual agent builder
34. Full voice conversation mode
35. Split view (two conversations side by side)
36. AI-native project management features
37. Performance optimization pass (Web Workers, Service Worker, prefetching)
38. Accessibility audit (WCAG 2.1 AA)
39. E2E test suite (Playwright)
40. Load testing and performance benchmarks

---

## Part 6: Technical Debt to Address Immediately

These are things that won't be noticed by users but will bite you as you scale:

| Issue | Location | Risk | Fix |
|-------|----------|------|-----|
| In-memory rate limiter | `backend/middleware/` | Resets on deploy, not multi-instance safe | Redis-backed limiter |
| No Python linting in CI | project root | Code quality drift | Add ruff to CI |
| 1378-line chat-input.tsx | `frontend/components/` | Impossible to maintain/test | Split into 6 focused components |
| 766-line agent.py | `backend/services/` | Complex branching logic, hard to debug | Extract ToolExecutor, StreamHandler |
| No frontend tests | `frontend/` | UI regressions go unnoticed | Vitest + RTL for core components |
| No CI/CD | `.github/workflows/` | Manual deploys, no safety net | GitHub Actions pipeline |
| Manual migrations in main.py | `backend/main.py` | Fragile, won't scale | Consolidate into Alembic |
| No connection pool tuning | `backend/database.py` | Connection exhaustion under load | Configure pool_size, max_overflow |
| Lazy Shiki in browser | `frontend/lib/` | Heavy computation on main thread | Move to Web Worker |

---

## Part 7: Metrics That Define "World Class"

Track these to know when you've arrived:

| Metric | Current (est.) | Target |
|--------|---------------|--------|
| Time to first token | ~1-3s | <500ms (with caching) |
| P95 page load | Unknown | <1.5s |
| Test coverage (backend) | ~15% | >80% |
| Test coverage (frontend) | 0% | >60% |
| Lighthouse performance | Unknown | >90 |
| Lighthouse accessibility | Unknown | >95 |
| MTTR (mean time to recovery) | Unknown (no monitoring) | <15min |
| Deploy frequency | Manual | Multiple per day |
| Error rate | Unknown | <0.1% |
| Concurrent users supported | ~50 (est.) | 1000+ |

---

*This document is a living roadmap. Update as items are completed and priorities shift. The goal isn't to build everything — it's to build the right things exceptionally well.*
