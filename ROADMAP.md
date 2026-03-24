# Nexus: From Good to World Class

> **Context:** Internal data analysis tool for a handful of users. Primary use case: "help me with this Excel", generate PowerPoints, diverse file processing. May go external later. Competing with CompanyGPT (unreliable, outdated models, terrible UX).

---

## PRIORITY 1 — The Demo Moment (Speed + Diverse Inputs + Slick)

_"Drop an Excel file, get a full analysis with charts in seconds, then export to PowerPoint."_

### File Intelligence
- [ ] **Drag-and-drop file processing** — drop Excel/CSV/PDF into chat, AI auto-analyzes (schema, summary, previews first rows)
- [ ] **Paste images directly** — clipboard image paste into chat input (screenshots, charts, photos)
- [ ] **File preview cards** — uploaded files render as rich cards (Excel shows column headers + row count, PDF shows page count + title, images show thumbnail)
- [ ] **@-mention files from sandbox** — type `@filename` in chat to inject file context
- [ ] **Multi-file upload** — drag multiple files at once, AI processes them together
- [ ] **Output file downloads** — when AI generates a file (PowerPoint, PDF, Excel), show a prominent download card inline

### Artifact Cards
- [ ] **Interactive artifact cards** — code, charts, tables render as expandable cards with actions (copy, download, re-run, edit)
- [ ] **Chart cards** — matplotlib/plotly output renders as a zoomable, downloadable card with "regenerate with..." option
- [ ] **Table cards** — dataframe output renders as a sortable, filterable table you can export to CSV/Excel
- [ ] **PowerPoint/document cards** — generated .pptx/.docx/.pdf files render as preview cards with download button
- [ ] **Artifact gallery** — right panel "Artifacts" tab shows all generated outputs in a clean grid, not just a list

### Speed & Polish
- [ ] **Instant file analysis** — pre-process common file types (Excel, CSV) client-side before sending to show a preview immediately
- [ ] **Streaming artifact rendering** — charts/tables appear as they're generated, not after the full response
- [ ] **Smooth panel transitions** — animate sidebar/right panel open/close with spring easing
- [ ] **Typing indicator** — show "Nexus is thinking..." with animated dots before first token arrives

---

## PRIORITY 2 — Keyboard-First Power UX

_Every action reachable without touching the mouse._

### Slash Commands
- [ ] **Slash command system** — `/model gpt-5`, `/export md`, `/clear`, `/system <prompt>`, `/help`
- [ ] **Autocomplete dropdown** — typing `/` shows available commands with fuzzy search
- [ ] **Custom slash commands** — users define their own (e.g. `/analyze` → "Analyze this dataset and create 5 visualizations")

### Keyboard Navigation
- [ ] **Arrow-key sidebar** — Up/Down to navigate conversations, Enter to select, Delete to remove
- [ ] **Cmd+K everything** — search messages, run commands, switch models, open conversations — one bar to rule them all
- [ ] **Vim-style optional mode** — `j/k` to scroll messages, `e` to edit, `r` to regenerate, `y` to copy
- [ ] **Keyboard cheat sheet** — `?` shows all shortcuts in an overlay

### Session & State
- [ ] **Session persistence** — close the tab, come back tomorrow: same scroll position, open panels, draft message preserved
- [ ] **Undo/redo** — Cmd+Z to undo last action (delete, edit, branch)

---

## PRIORITY 3 — Multi-Session Context & Agent Memory

_"Use the schema from my last conversation" should just work._

### Cross-Conversation Intelligence
- [ ] **Multi-conversation context** — reference another conversation: "use the data from conversation X"
- [ ] **Conversation search** — full-text search across ALL conversations, not just sidebar title filter
- [ ] **Search within conversation** — Cmd+F style search across messages with highlights
- [ ] **Conversation insights** — end-of-session summary: tokens used, files created, key outputs

### Agent Memory & Personas
- [ ] **Simple agent builder** — ChatGPT-style: name, description, system prompt, model, tools toggle. No visual nodes.
- [ ] **Agent memory** — agents remember user preferences across sessions ("I prefer pandas over polars")
- [ ] **Agent quick-switch** — switch persona mid-conversation without losing context
- [ ] **Default agent per user** — set a personal default agent that loads on every new conversation
- [ ] **System prompt visibility** — view/edit the active system prompt from the top bar or settings

### Knowledge Base (RAG)
- [ ] **Document upload to knowledge base** — upload files that persist across conversations as reference material
- [ ] **RAG with citations** — responses cite which uploaded document they drew from
- [ ] **Per-agent knowledge bases** — attach specific documents to specific agents
- [ ] **Auto-index sandbox files** — files in the sandbox are automatically available as context

---

## PRIORITY 4 — Data Analysis Superpowers

_The reason people open Nexus instead of ChatGPT._

### Excel/Data Workflow
- [ ] **Excel formula helper** — paste a formula, AI explains it. Describe what you want, AI writes the formula.
- [ ] **DataFrame inspector** — after AI loads data, show an interactive table preview in the right panel
- [ ] **Auto-visualization** — AI automatically suggests and generates charts after loading any dataset
- [ ] **Data pipeline builder** — chain multiple analysis steps: load → clean → transform → visualize → export
- [ ] **Template notebooks** — pre-built analysis templates (EDA, forecasting, pivot tables, dashboards)

### Output Generation
- [ ] **PowerPoint generation** — AI creates .pptx files with charts, text, and formatting via python-pptx
- [ ] **PDF report generation** — AI creates formatted PDF reports from analysis results
- [ ] **Excel output** — AI writes results back to .xlsx with formatting, charts, pivot tables
- [ ] **Dashboard mode** — pin multiple chart artifacts to create a live dashboard view

---

## COMPLETED

### Chat Experience
- [x] **Message editing** — click-to-edit sent user messages in-place, re-submit as branch
- [x] **Stop generation properly** — wire up `AbortController` to actually cancel the SSE stream
- [x] **Retry with different model** — model picker dropdown on regenerate (frontend + backend)
- [x] **Streaming cancel + partial save** — save what was generated so far when stopping mid-stream

### Sidebar & Navigation
- [x] **Conversation pinning** — pin conversations to top, persisted in localStorage
- [x] **Bulk actions** — multi-select mode with bulk delete and export
- [x] **Collapsible sidebar** — toggle to hide sidebar for more chat space (Cmd+B)
- [x] **Conversation preview on hover** — tooltip with title, model, message count, date
- [x] **Inline rename** — double-click to rename conversation title in sidebar

### Visual Design & Polish
- [x] **Responsive / mobile layout** — 3 breakpoints (mobile/tablet/desktop), overlay panels, safe areas
- [x] **Code block headers** — language label, copy button in assistant code blocks
- [x] **Toast notification system** — success/error/warning/info toasts
- [x] **Delete confirmation in sidebar** — sidebar delete uses confirm dialog
- [x] **Loading skeletons** — skeleton placeholders when loading conversations
- [x] **Export conversations** — export as Markdown via sidebar download button

### Architecture
- [x] **Extract streaming logic** — useStreaming hook + mapRawMessages + processSseEvent helpers
- [x] **Error boundaries** — ErrorBoundary wraps sidebar, chat, and right panel
- [x] **Diff view for file changes** — DiffViewer component + write_file detection in ExecBlock
- [x] **DRY message mapping** — `mapRawMessages` helper used everywhere
- [x] **Refactor ChatInput** — streaming logic extracted into `useStreaming` hook

---

## LATER — Nice to Have

### Visual Polish
- [ ] **Resizable sidebar** — drag handle to resize sidebar width
- [ ] **Full-screen focus mode** — hide sidebar + top bar for distraction-free chat (Cmd+Shift+F)
- [ ] **Split view** — compare two conversations or branches side-by-side
- [ ] **Message density toggle** — compact vs comfortable spacing
- [ ] **Light theme option** — dark-only is an accessibility barrier
- [ ] **Detachable panels** — pop out terminal/files/preview into own browser window

### Empty State & Onboarding
- [ ] **Wire up template buttons** — Python/Node.js/Data Analysis/Web App with actual actions
- [ ] **Guided first-run experience** — subtle tour or contextual hints for new users
- [ ] **Quick actions grid** — "Upload a file", "Analyze data", "Generate a report"

### Sandbox & Code
- [ ] **Sandbox template selection** — let users pick or configure environments at creation
- [ ] **Package installation UI** — install pip/npm packages without terminal commands
- [ ] **File editing in files panel** — in-place editing with syntax highlighting
- [ ] **Sandbox snapshots/checkpoints** — save and restore sandbox state
- [ ] **Git integration in sandbox** — init repo, commit, push to GitHub
- [ ] **One-click deploy** — push sandbox to Vercel/Railway/Fly.io
- [ ] **Ship to GitHub** — create a PR from sandbox changes

### Performance & Reliability
- [ ] **Virtualized message list** — for 100+ message conversations
- [ ] **Fix mermaid re-renders** — memoize mermaid initialization
- [ ] **Lazy-load heavy deps** — mermaid (~2MB), KaTeX code-split
- [ ] **Service worker / offline** — queue messages when offline
- [ ] **Rate limiting** — API request limits per user
- [ ] **WebSocket reconnection** — auto-reconnect terminal
- [ ] **SSE error recovery** — retry on stream break
- [ ] **Health check endpoint** — `/health` and `/ready`

### Security & Production
- [ ] **CSRF protection** — cookie-based JWT needs CSRF tokens
- [ ] **Sanitize markdown output** — XSS prevention
- [ ] **Content Security Policy** — CSP headers
- [ ] **Audit logging** — who did what when
- [ ] **Usage quotas with visual budget** — per-user cost limits
- [ ] **JWT refresh flow** — graceful token expiration

### Accessibility
- [ ] **ARIA attributes** — roles, labels, live regions throughout
- [ ] **Keyboard navigation in sidebar** — arrow-key through conversations
- [ ] **Focus indicators** — visible custom focus styles
- [ ] **Reduced-motion support** — respect `prefers-reduced-motion`
- [ ] **Color contrast audit** — verify palette meets WCAG AA

### Developer Experience
- [ ] **Tests** — unit + integration + e2e
- [ ] **CI/CD pipeline** — GitHub Actions
- [ ] **Eliminate magic strings** — extract event names to constants
- [ ] **Shared API types** — generate from backend schema
- [ ] **Linting & formatting** — ESLint, Prettier, pre-commit hooks

### Analytics & Observability
- [ ] **Error tracking** — Sentry or equivalent
- [ ] **Performance monitoring** — Web Vitals, API latency
- [ ] **User-facing cost dashboard** — usage breakdown by model, day, conversation
- [ ] **Model comparison analytics** — compare quality, speed, cost

### Future Differentiators
- [ ] **Voice mode** — hold space to talk, TTS response
- [ ] **Screenshot-to-code** — paste screenshot, AI generates UI
- [ ] **Whiteboard mode** — draw sketches, AI interprets
- [ ] **Prompt chains** — save prompt sequences as reusable workflows
- [ ] **Snippet library** — save code/prompts/outputs for reuse
- [ ] **Conversation replay** — play back conversations like recordings
- [ ] **Response comparison mode** — generate 3 responses side-by-side, pick the best
- [ ] **Public agent marketplace** — publish and discover community agents
