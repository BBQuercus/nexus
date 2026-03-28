# Nexus Feature Roadmap

Phased roadmap to position Nexus as a full agent platform ahead of CompanyGPT. Prioritized for a solo developer — each phase builds on the previous one.

## What Already Exists

These features are already built and only need incremental polish:

- **Enterprise auth & access controls** — SSO (WorkOS/Entra ID), RBAC with fine-grained permissions, org membership, audit logging. SAML/OIDC/SCIM available via WorkOS config.
- **Memory controls** — User/project/conversation memory with extraction, relevance scoring, full CRUD.
- **Org analytics** — Token usage, cost tracking, admin dashboard, feedback system, error tracking.
- **Multi-agent orchestration** — `run_multi_agent_loop` exists with basic coordination.
- **Rich document intelligence** — RAG pipeline with PDF, DOCX, PPTX, XLSX, CSV, hybrid search, citations.

---

## Phase 1: Approval Gates & Agent Workflows

Make agents trustworthy and rerunnable. Extends the existing agent model rather than creating a separate "workflow" concept.

### Human Approval Steps

- [x] Add approval gate model to DB (persisted, supports async — user can close browser and return)
- [x] All tools gated by default, but all approved out of the box (zero friction default)
- [x] Per-agent approval configuration (toggle which tools require approval per agent)
- [ ] Per-workspace approval overrides (org admins can enforce approval on specific tools globally)
- [x] Inline chat approval UX — agent shows proposed action, user clicks Approve / Reject / Edit
- [x] Agent loop pauses and resumes on approval (backed by DB state, not session) — polls DB every 1s, 10min timeout
- [x] Approval audit trail (who approved what, when)

### Agent-as-Workflow Extensions

- [x] Prompt templates with `{{variables}}` — parameterized agent inputs for reuse
- [x] Run history — log every agent execution with inputs, outputs, tool calls, timing
- [x] Rerun from history — clone a previous run with different inputs
- [x] Draft / Published versioning — edits go to draft, explicit publish makes the agent live
- [x] Cron scheduling — attach a schedule to an agent ("run every Monday with this prompt"), background worker polls every 60s using croniter
- [x] Manual trigger — run any saved agent on demand with custom inputs

---

## Phase 2: Tool Wiring & Structured Artifacts

Let users connect external systems and produce real outputs.

### No-Code Tool Wiring

- [x] Generic REST API connector — URL, auth (API key / OAuth / Bearer), headers, request/response mapping
- [ ] Database connector — Postgres, MySQL connection with query tools (extends existing DuckDB capability)
- [ ] Pre-built connectors — guided setup for popular tools (Slack, Jira, GitHub, Google Workspace)
- [x] Integration management UI — create, test, edit, delete connectors
- [x] Permission model — admins manage org-wide integrations, editors create personal/project-scoped ones
- [x] Connector ↔ Agent linking — assign available integrations per agent

### Structured Artifacts

- [ ] Typed artifact system — reports (Markdown/HTML), charts (Vega-Lite), code/patches, data (CSV/JSON/XLSX)
- [ ] Per-type rendering — rich preview for each artifact type in the conversation
- [ ] Download/export for all artifact types
- [ ] Artifact versioning within a conversation (agent can update an artifact across messages)
- [ ] Artifacts remain conversation-bound (always linked to source conversation, no separate file manager)

---

## Phase 3: Agent Builder & Action Layer

Give users a powerful configuration UI and let agents take real-world actions.

### Rich Agent Configurator

- [x] Visual prompt template editor with variable insertion and preview
- [ ] Tool selection UI with per-tool approval gate toggles
- [ ] Knowledge base linking UI
- [ ] Input/output schema definition (what the agent expects and produces)
- [x] Scheduling configuration UI (cron builder) *(text input + presets, not a full visual builder)*
- [x] Test run mode — run the agent with sample inputs before publishing (LLM invocation + LLM-as-judge evaluation)

**Note:** We're building a rich configurator, not a node-based flow editor. LLM workflows are non-deterministic — a well-prompted agent with the right tools handles branching better than a rigid graph. If user demand shows otherwise, a simple step sequence (ordered agent calls) can be added later.

### Action Layer (Communication First)

- [x] Email drafting and sending (with approval gate) — aiosmtplib delivery via configurable SMTP
- [x] Slack message sending (with approval gate) — incoming webhook integration
- [x] Teams message sending (with approval gate) — Adaptive Card via webhook
- [x] Action preview — show the user exactly what will be sent before approval
- [x] Action history — log all external actions taken by agents

---

## Phase 4: Templates, Evaluation & Debugging

Package common workflows, ensure quality, and provide observability.

### Vertical Agent Templates

- [ ] Business analysis templates — SWOT analysis, market research, competitive intelligence, due diligence
- [ ] Internal ops templates — policy Q&A, expense analysis, contract review, compliance checks
- [ ] Template library UI — browse, preview, and instantiate templates as new agents
- [ ] Template customization — users can fork a template and modify it

### Prompt Regression Testing

- [x] Test case model — input/expected-output pairs linked to an agent
- [x] Test runner — execute test cases against current agent config, compare outputs (real LLM call + LLM-as-judge)
- [ ] Regression detection — flag when agent changes cause test failures
- [x] Test results dashboard — pass/fail history, failure details
- [ ] CI integration — run evals as part of the deployment pipeline

### Replay & Debugging

- [x] Agent run inspector — full trace of each run: LLM calls, tool invocations, inputs/outputs, timing, token counts
- [ ] Prompt assembly viewer — see how system prompt, memory, RAG context, and user message were composed
- [x] Step-by-step replay — walk through an agent run one step at a time *(read-only timeline, no re-execution)*
- [ ] Error highlighting — surface where and why an agent run failed or produced unexpected results

---

## Phase 5: Voice & Meeting Workflows

- [ ] Realtime speech input (browser-based, transcription via Whisper or similar)
- [ ] Transcript summarization — upload or record meetings, get structured summaries *(removed — deprioritized)*
- [ ] Action item extraction — pull tasks and decisions from transcripts *(removed — deprioritized)*
- [ ] Speaker diarization — identify who said what *(removed — deprioritized)*
- [ ] Voice-first workspace mode — hands-free interaction with agents

---

## Phase 6: Agent Marketplace

- [x] Public / private / org-scoped agent visibility
- [x] Agent publishing flow — submit, review, approve *(publish works, but review/approval step is bypassed — goes straight to published)*
- [x] Usage stats and ratings per agent *(rating endpoints work, aggregate fields not auto-updated)*
- [x] Fork / clone — copy a marketplace agent into your org and customize it
- [x] Curated collections — featured agents by category *(featured flag + categories, no admin curation UI)*
- [x] Version history — marketplace agents track published versions (auto-increments patch version on re-publish)

---

## Phase 7: Self-Hosting

- [x] Docker Compose deployment — single `docker-compose.yml` for the full stack (Postgres, Redis, backend, frontend) *(functional but no nginx/SSL/monitoring)*
- [ ] Environment configuration docs — all env vars, secrets, and external service setup
- [ ] Data migration tooling — export/import between cloud and self-hosted instances
- [ ] Health check endpoints — for monitoring self-hosted deployments

---

## Backlog (Deprioritized)

These are valid features but lower priority given current resources:

- **Live collaboration** — Presence, shared conversations, multiplayer editing. Big investment, low ROI until user base grows.
- **Policy engine** — Central admin controls for models, tools, execution limits. RBAC covers most needs today.
- **Knowledge governance** — Source freshness, stale alerts, retention policies. Incremental add to existing RAG.
- **Full environment execution model** — Reproducible workspaces with repo mounts, background jobs. Nice-to-have.
- **Model comparison** — Run same prompt across models. Single standard model for workflows reduces need.
- **Cost & latency monitoring** — Dashboards exist in admin analytics already. Enhance when needed.

---

## Strategic Framing

This roadmap positions Nexus as a full agent platform — not just an AI chat product. The phased approach ensures each layer has solid primitives before building the next:

1. **Trust** (Phase 1) — Approval gates make agents safe for enterprise use
2. **Power** (Phase 2) — Tool wiring and artifacts make agents productive
3. **Usability** (Phase 3) — The configurator and action layer make agents accessible
4. **Scale** (Phase 4) — Templates, testing, and debugging make agents reliable
5. **Reach** (Phases 5-7) — Voice, marketplace, and self-hosting expand the audience
