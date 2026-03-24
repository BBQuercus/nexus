# Nexus — Full Implementation Plan

> Internal data analysis tool. "Drop an Excel, get charts and a PowerPoint." Handful of users now, may go external. Must beat internal competitor on reliability, speed, and UX.

---

## Phase 1 — Reliability & Trust Foundation

_Users won't trust a tool that breaks. internal competitor's #1 complaint is "often down / having issues." We fix this first._

### 1.1 Structured Logging & Request Tracing
**Goal:** Every request traceable end-to-end. When something goes wrong, find the cause in <30 seconds.

- [ ] **Request ID middleware** — generate UUID per request, attach to all log entries, return in `X-Request-Id` header
- [ ] **Structured JSON logging** — replace `logging.basicConfig` with `structlog` or JSON formatter. Every log line: `{timestamp, level, request_id, user_id, message, extra}`
- [ ] **Log all critical paths** — auth (login/logout/fail), conversation CRUD, message send/receive, sandbox lifecycle, tool execution, LLM calls (model, tokens, latency), errors
- [ ] **SSE event logging** — log event types and timing per stream (first token latency, total duration, error events)
- [ ] **Frontend error reporting** — `window.onerror` + `unhandledrejection` → POST to `/api/errors` with stack trace, request ID, user context

### 1.2 Health Checks & Dependency Monitoring
**Goal:** Know instantly when something is down. Auto-recover where possible.

- [ ] **Deep health check** — `GET /health` checks: database ping, Daytona API reachable, LiteLLM reachable. Return `{status, checks: {db: ok, daytona: ok, llm: ok}, latency_ms}`
- [ ] **Readiness probe** — `GET /ready` — same as health but returns 503 if any check fails (for load balancers)
- [ ] **Frontend health banner** — if `/health` returns degraded, show a subtle yellow banner: "Some services are experiencing issues"
- [ ] **WebSocket reconnection** — auto-reconnect terminal WebSocket with exponential backoff (1s, 2s, 4s, max 30s). Show "Reconnecting..." indicator
- [ ] **SSE stream recovery** — if stream breaks mid-response, show "Connection lost. Retrying..." and re-fetch the conversation state

### 1.3 Error Handling & Resilience
**Goal:** Errors are caught, reported, and communicated clearly. Never a blank screen or silent failure.

- [ ] **Global exception handler** — FastAPI middleware catches all unhandled exceptions, logs full traceback with request ID, returns `{error, message, request_id}` to client
- [ ] **Graceful LLM failures** — if LLM returns 429/500/timeout: retry once with backoff, then show "Model is temporarily unavailable, try again or switch model"
- [ ] **Sandbox timeout handling** — code execution has 120s timeout already; surface it clearly: "Execution timed out after 2 minutes"
- [ ] **Frontend toast on API errors** — every `ApiError` from `apiFetch` triggers a toast with the error message. No more silent `console.error`
- [ ] **Offline detection** — detect `navigator.onLine` changes, show banner when offline, queue draft messages

### 1.4 Auth Hardening
**Goal:** Sessions work reliably. No surprise logouts. No security holes.

- [ ] **JWT refresh flow** — when token has <1 hour remaining, silently refresh via `/auth/refresh`. If refresh fails, show "Session expired" modal with re-login button
- [ ] **Session timeout warning** — 5 minutes before expiry, show subtle "Session expiring soon" toast with "Extend" button
- [ ] **Graceful 401 handling** — any API 401 → redirect to login with "You've been logged out" message, preserve the conversation URL to return to after login
- [ ] **CSRF token** — generate per-session CSRF token, validate on all state-changing requests

---

## Phase 2 — User Feedback & Analytics

_Know what users do, what they struggle with, and what they love._

### 2.1 Feedback System
**Goal:** Users can tell us when things are good or bad. We can act on it.

- [ ] **Enhanced thumbs up/down** — on every assistant message, show subtle thumbs up/down. Clicking opens a small feedback form: "What went wrong?" with quick tags: [Wrong answer, Too slow, Code didn't work, Formatting issue, Other] + optional text
- [ ] **Feedback database table** — `feedback(id, user_id, message_id, conversation_id, rating, tags[], comment, model, created_at)` — separate from message.feedback for richer data
- [ ] **Feedback toast confirmation** — "Thanks for your feedback!" after submitting
- [ ] **Admin feedback dashboard** — `/admin/feedback` page showing: feedback by model, common tags, recent comments, rating trends over time
- [ ] **Conversation rating** — at the end of a conversation (after 5+ messages), show a subtle "How was this conversation?" prompt

### 2.2 Usage Analytics
**Goal:** Understand how the tool is used to prioritize features.

- [ ] **Event tracking** — track key events client-side: conversation_created, message_sent, file_uploaded, model_switched, sandbox_created, artifact_downloaded, export_used, shortcut_used
- [ ] **Usage dashboard for users** — in the user dropdown, show: conversations this week, tokens used, cost estimate, favorite model, files processed
- [ ] **Admin usage dashboard** — total users, active users (daily/weekly), messages per day, popular models, average response time, error rate, most-used features
- [ ] **Cost tracking** — already have `usage_logs` table. Surface it: per-user monthly cost with visual budget bar (like internal competitor but better)

### 2.3 Model Performance Tracking
**Goal:** Know which models are fast, cheap, and good.

- [ ] **Per-model metrics** — track for each model: avg first-token latency, avg total latency, avg tokens, error rate, user feedback score
- [ ] **Model status indicators** — in the model picker, show a green/yellow/red dot based on recent error rate and latency
- [ ] **Slow model warning** — if a model's avg latency is >10s, show "(slower)" label in picker

---

## Phase 3 — Onboarding & Discoverability

_New users should feel competent in <60 seconds._

### 3.1 First-Run Experience
**Goal:** Guide new users without being annoying.

- [ ] **Welcome screen** — on first login (no conversations yet), show a full-page welcome: "Welcome to Nexus" with 3 cards: "Analyze Data" (upload Excel), "Write Code" (start coding), "Ask Anything" (general chat). Each card starts a conversation with that context
- [ ] **Interactive tour** — subtle spotlight tour (5 steps max): 1) "Type here to chat" 2) "Upload files here" 3) "Switch models here" 4) "Your conversations are here" 5) "Use Cmd+K for quick actions". Dismissible, never shows again
- [ ] **First message suggestions** — empty conversation shows contextual suggestions based on selected mode: data analysis → "Upload an Excel file to get started" / "Paste a CSV and ask me to visualize it"
- [ ] **Template conversations** — "Try an example" button that loads a pre-built conversation showing Nexus analyzing a sample dataset with charts

### 3.2 Contextual Help
**Goal:** Help is available when needed, never in the way.

- [ ] **Keyboard shortcut overlay** — press `?` to see all shortcuts. Categorized: Navigation, Chat, Sandbox, Models
- [ ] **Empty state guidance** — each panel shows helpful text when empty: Files panel → "Files will appear here when the AI creates them", Artifacts → "Charts and code snippets will be collected here"
- [ ] **Tooltips on all icon buttons** — every icon-only button has a title tooltip with the action name + shortcut if applicable
- [ ] **Feature hints** — after 3 conversations, show a one-time hint: "Did you know you can edit messages? Click the pencil icon." — max 1 hint per session

### 3.3 Slash Commands & Discoverability
**Goal:** Power users can go fast. New users discover capabilities.

- [ ] **Slash command system** — type `/` in chat input to see all commands with descriptions
- [ ] **Core commands:** `/model <name>` (switch model), `/export` (export conversation), `/clear` (new conversation), `/system <prompt>` (set system prompt), `/help` (show help)
- [ ] **Autocomplete** — fuzzy search as you type, arrow keys to navigate, Enter to select
- [ ] **Cmd+K enhanced** — search across: conversations, commands, models, recent files. Show results in categorized sections

---

## Phase 4 — The Demo Moment (File Intelligence & Artifacts)

_"Drop an Excel file, get a full analysis with charts, export to PowerPoint."_

### 4.1 File Processing
**Goal:** Any file dropped into chat gets processed intelligently.

- [ ] **Rich file upload cards** — when user uploads a file, show a card: filename, size, type icon, preview (first 5 rows for CSV/Excel, thumbnail for images, page count for PDF)
- [ ] **Auto-analysis prompt** — after uploading Excel/CSV, auto-suggest: "Analyze this dataset" / "Show summary statistics" / "Create visualizations"
- [ ] **Clipboard image paste** — Cmd+V pastes images from clipboard into chat. Show preview before sending
- [ ] **Multi-file upload** — drag multiple files at once, each gets its own preview card
- [ ] **File type detection** — detect file type from content, not just extension. Handle renamed files gracefully

### 4.2 Artifact Cards
**Goal:** AI outputs aren't just markdown. They're interactive, downloadable objects.

- [ ] **Chart artifact cards** — matplotlib/plotly output renders as a card with: zoomable image, "Download PNG" button, "Download SVG" button, "Regenerate" button
- [ ] **Table artifact cards** — DataFrame output renders as: sortable table, column search, row count, "Export to CSV" / "Export to Excel" buttons
- [ ] **File artifact cards** — generated files (.pptx, .xlsx, .pdf, .docx) render as: file icon, filename, size, prominent "Download" button, file type badge
- [ ] **Code artifact cards** — code blocks have: language label, copy button, "Run in sandbox" button (for executable code), line numbers
- [ ] **Artifact panel upgrade** — right panel "Artifacts" tab shows all artifacts as a visual grid/list with filters by type

### 4.3 Data Analysis Superpowers
**Goal:** Nexus is the best tool for "help me with this data."

- [ ] **Excel/CSV auto-preview** — when AI loads a file in sandbox, show an interactive table preview in the right panel automatically
- [ ] **PowerPoint generation** — system prompt includes python-pptx knowledge. AI can generate .pptx files with slides, charts, text
- [ ] **PDF report generation** — AI can generate formatted PDFs via reportlab or weasyprint
- [ ] **Excel output** — AI can write formatted .xlsx files with openpyxl (charts, formatting, pivot tables)
- [ ] **Smart output detection** — when AI writes to `/home/daytona/output/`, auto-detect file type and show appropriate artifact card

---

## Phase 5 — Agent System & Memory

_Simple, useful agents. Not an over-engineered visual builder._

### 5.1 Simple Agent Builder
**Goal:** Create an agent in 30 seconds. No nodes, no complexity.

- [ ] **ChatGPT-style agent builder** — form with: name, description (optional), avatar/emoji, system prompt (textarea with placeholder examples), default model (dropdown), tools toggle (checkboxes: code execution, web search, file access)
- [ ] **Agent preview** — "Test this agent" button that opens a temporary conversation with the agent
- [ ] **Agent library** — clean list/grid of your agents + public agents. Search, filter by category
- [ ] **Quick-create from conversation** — "Save as agent" button: takes the current system prompt + model as a starting point
- [ ] **Agent sharing** — toggle agent public/private. Public agents visible to all users with usage count

### 5.2 Agent Memory & Context
**Goal:** The AI remembers things between conversations.

- [ ] **User preferences store** — per-user key-value store: "preferred language: Python", "date format: DD.MM.YYYY", "output style: detailed". Agents can read/write
- [ ] **Conversation context injection** — "Use context from conversation X" — select a past conversation, its messages are injected as context
- [ ] **System prompt from top bar** — click the agent/mode indicator in the top bar to view and edit the active system prompt
- [ ] **Context window indicator** — show a subtle progress bar or count: "12,400 / 128,000 tokens used" — warn when approaching limit

---

## Phase 6 — Production Hardening

_The stuff that keeps it running at 3am without anyone waking up._

### 6.1 Rate Limiting & Quotas
- [ ] **Request rate limiting** — per-user: 60 requests/minute for chat, 10 requests/minute for sandbox creation. Return 429 with `Retry-After` header
- [ ] **Token quota** — per-user monthly token limit (configurable). Show usage bar in user menu. Warn at 80%, block at 100% with "quota exceeded" message
- [ ] **Concurrent request limit** — max 3 simultaneous LLM streams per user. Queue additional requests with "Waiting in queue..." indicator

### 6.2 Security
- [ ] **Markdown sanitization** — use DOMPurify on all `dangerouslySetInnerHTML` content. Strip script tags, event handlers, data URIs
- [ ] **Content Security Policy** — add CSP headers: restrict script sources, prevent inline styles from untrusted content
- [ ] **File upload validation** — max file size (50MB), allowed extensions whitelist, content-type verification
- [ ] **Sandbox isolation audit** — verify Daytona sandboxes can't access host filesystem, network restricted appropriately

### 6.3 Database & Performance
- [ ] **Connection pooling** — verify asyncpg pool settings (min/max connections, timeout)
- [ ] **Query optimization** — add indexes on: `messages(conversation_id, created_at)`, `conversations(user_id, updated_at)`, `usage_logs(user_id, created_at)`
- [ ] **Pagination** — all list endpoints paginated with cursor-based pagination for large datasets
- [ ] **Cleanup jobs** — scheduled task to: delete orphaned sandboxes, clean up temp files, archive old conversations (>90 days inactive)

### 6.4 Deployment & Monitoring
- [ ] **Docker health checks** — add HEALTHCHECK to Dockerfiles
- [ ] **Graceful shutdown** — handle SIGTERM: finish active streams, close DB connections, then exit
- [ ] **Error alerting** — if error rate exceeds threshold, alert (webhook to Slack or email)
- [ ] **Uptime monitoring** — external health check ping every 60 seconds

---

## Phase 7 — Polish & Power Features

_The details that make people say "this feels premium."_

### 7.1 Keyboard-First UX
- [ ] **Full keyboard navigation** — arrow keys in sidebar, Tab through UI regions, Enter to action
- [ ] **Vim-style optional** — `j/k` scroll messages, `e` edit, `r` regenerate, `y` copy, `g g` jump to top, `G` jump to bottom
- [ ] **Keyboard cheat sheet** — `?` opens overlay with all shortcuts categorized
- [ ] **Cmd+K everything** — search conversations, messages, commands, models, agents from one bar

### 7.2 Session & State
- [ ] **Draft persistence** — save unsent message content to localStorage per conversation. Restore on return
- [ ] **Panel state persistence** — remember which panels are open, which tab is active, scroll position
- [ ] **Undo/redo stack** — Cmd+Z undoes last destructive action (delete, edit). Cmd+Shift+Z redoes

### 7.3 Conversation Management
- [ ] **Tags/colors** — tag conversations with custom labels and colors for organization
- [ ] **Archive** — archive old conversations instead of delete. Archived section in sidebar, searchable
- [ ] **Cross-conversation search** — full-text search across all conversations with highlighted results
- [ ] **Conversation templates** — save model + system prompt + starter message as a reusable template

### 7.4 Visual Polish
- [ ] **Smooth panel animations** — spring-based transitions for sidebar/right panel open/close
- [ ] **Typing indicator** — animated "Nexus is thinking..." before first token
- [ ] **Better copy feedback** — toast notification instead of tiny inline "Copied" text
- [ ] **Message density toggle** — compact/comfortable spacing options
- [ ] **Full-screen focus mode** — Cmd+Shift+F hides everything except chat

---

## Implementation Order

| Week | Focus | Key Deliverables |
|------|-------|-----------------|
| 1 | Phase 1 (Reliability) | Request tracing, structured logging, health checks, error handling, WebSocket reconnect |
| 2 | Phase 2 (Feedback) | Enhanced feedback UI, usage dashboard, cost tracking, model metrics |
| 3 | Phase 3 (Onboarding) | Welcome screen, interactive tour, slash commands, Cmd+K upgrade |
| 4-5 | Phase 4 (Demo Moment) | File upload cards, artifact cards, PowerPoint/Excel/PDF generation, auto-preview |
| 6 | Phase 5 (Agents) | Simple agent builder, agent library, system prompt visibility, context indicator |
| 7 | Phase 6 (Hardening) | Rate limiting, quotas, sanitization, CSP, DB optimization, monitoring |
| 8 | Phase 7 (Polish) | Keyboard-first, session persistence, tags, archive, animations |

---

## Success Criteria

**Reliability:** <1% error rate. Health checks pass 99.9% of the time. Zero silent failures.
**Speed:** First token in <2 seconds. File upload to analysis in <10 seconds.
**Onboarding:** New user can complete a useful task in <60 seconds without reading docs.
**Feedback:** >10% of messages get thumbs up/down. Average rating >4/5.
**Engagement:** Users return within 48 hours of first use. >3 conversations per user per week.
