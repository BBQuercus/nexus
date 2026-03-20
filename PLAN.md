# Nexus — AI Agent Workspace with Sandboxed Code Execution

## Overview

A production-grade AI agent workspace where users chat with LLMs that can **write and execute code in isolated Daytona sandboxes** in real time. The AI doesn't just talk — it _builds, runs, analyzes, and visualizes things_. Users see live terminal output, inline charts and diagrams, browse generated files, preview running web apps, upload their own data, and fork/snapshot sandbox state at any point.

Heavy focus on **data analysis workflows**: drop a CSV, ask a question, get back rendered charts, formatted tables, and insights — all executed in a real sandbox, not hallucinated. The AI can use pandas, matplotlib, seaborn, plotly, and any PyPI package.

Multi-user, persistent conversations, WorkOS authentication, Postgres-backed. Designed to showcase Daytona's sandbox infrastructure as the backbone of agentic AI workflows.

**What makes this 100x better than a standard enterprise chat UI:**
- AI executes code in real sandboxes, not just generates it
- **Inline visualizations** — matplotlib/plotly charts render directly in the chat as PNG/SVG
- **Mermaid diagrams** — architecture diagrams, flowcharts, sequence diagrams render live in markdown
- **Rich data tables** — CSV/dataframe output renders as sortable, formatted tables, not monospace text
- Live app preview — AI builds a web app, you see it running in an embedded iframe
- **Sandbox templates** — pre-configured environments (Python data science, Node, React) for instant startup
- Sandbox snapshots + forking — branch any conversation with full environment state
- File upload — drag CSVs, images, data files into chat, they land in the sandbox filesystem
- Conversation branching — edit any message and fork a new timeline
- **Per-message cost tracking** — transparent token + cost badges on every response
- Custom agent personas — build and share reusable AI configurations
- Command palette (Cmd+K) — power-user keyboard-driven UX

---

## Architecture

```
nexus/
├── .env                          # All secrets and config
├── docker-compose.yml            # Postgres + pgAdmin (dev)
├── run.sh                        # Starts everything (db, backend, frontend)
├── pyproject.toml                # Python deps (managed with uv)
├── backend/
│   ├── main.py                   # FastAPI app — CORS, lifespan, router mounts
│   ├── config.py                 # Settings via pydantic-settings (.env loading)
│   ├── db.py                     # SQLAlchemy async engine + session factory
│   ├── models.py                 # ORM models (all tables)
│   ├── auth.py                   # WorkOS AuthKit integration, session middleware
│   ├── routers/
│   │   ├── chat.py               # Chat + streaming endpoints
│   │   ├── sandboxes.py          # Sandbox CRUD, snapshot, fork, preview
│   │   ├── conversations.py      # Conversation history CRUD, branching
│   │   ├── files.py              # File browser + upload to sandbox
│   │   ├── agents.py             # Custom agent persona CRUD
│   │   └── users.py              # User profile, usage stats
│   ├── services/
│   │   ├── llm.py                # LiteLLM proxy wrapper, tool-use orchestration
│   │   ├── sandbox.py            # Daytona SDK wrapper — create, exec, snapshot, preview
│   │   ├── agent.py              # Agent loop: plan → code → execute → observe → iterate
│   │   ├── extraction.py         # Artifact extraction (ideas, code snippets, diagrams)
│   │   ├── search.py             # Web search tool (SerpAPI wrapper)
│   │   └── media.py              # Sandbox image/file retrieval for inline rendering
│   └── prompts/
│       ├── system.py             # Base system prompts per agent mode
│       └── tools.py              # Tool definitions for function-calling models
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.ts               # Entry point, router init
│       ├── styles/
│       │   ├── tokens.css        # Design tokens (CSS custom properties)
│       │   ├── base.css          # Reset, typography, global styles
│       │   └── components.css    # Component-specific styles
│       ├── auth.ts               # WorkOS AuthKit redirect flow, session management
│       ├── router.ts             # Simple hash-based SPA router
│       ├── views/
│       │   ├── login.ts          # Login page
│       │   ├── workspace.ts      # Main workspace (chat + sandbox + artifacts)
│       │   └── agents.ts         # Agent persona browser + editor
│       ├── components/
│       │   ├── chat.ts           # Chat panel — messages, streaming, input
│       │   ├── terminal.ts       # Live terminal output from sandbox execution
│       │   ├── file-tree.ts      # Sandbox file browser (tree view)
│       │   ├── file-viewer.ts    # File content viewer with syntax highlighting
│       │   ├── diff-viewer.ts    # Side-by-side diff view for file changes
│       │   ├── preview.ts        # Live app preview iframe
│       │   ├── image-embed.ts    # Inline PNG/SVG chart rendering from sandbox
│       │   ├── mermaid.ts        # Mermaid diagram renderer (lazy-loaded)
│       │   ├── data-table.ts     # Rich table renderer for CSV/dataframe output
│       │   ├── artifacts.ts      # Extracted artifacts panel
│       │   ├── sandbox-bar.ts    # Sandbox status bar — resource usage, controls
│       │   ├── model-picker.ts   # Model selector dropdown
│       │   ├── command-palette.ts # Cmd+K command palette
│       │   ├── upload.ts         # File upload / drag-and-drop zone
│       │   ├── reasoning.ts      # Collapsible reasoning/thinking display
│       │   ├── feedback.ts       # Message feedback (thumbs up/down)
│       │   └── markdown.ts       # Markdown rendering (marked + shiki)
│       ├── services/
│       │   ├── api.ts            # Typed API client (fetch wrapper)
│       │   ├── sse.ts            # SSE stream consumer
│       │   ├── ws.ts             # WebSocket client for terminal streams
│       │   └── shortcuts.ts      # Keyboard shortcut registry
│       └── state.ts              # Global state store, reactive updates
└── migrations/
    └── ...                       # Alembic migrations
```

---

## Environment Variables (`.env` in project root)

```
# LLM
LITE_LLM_API_KEY=                 # Bearer token for LiteLLM proxy
LITE_LLM_URL=                     # Base URL of LiteLLM proxy

# Daytona
DAYTONA_API_KEY=                  # Daytona API key (from dashboard)
DAYTONA_API_URL=                  # Daytona API base URL

# WorkOS
WORKOS_API_KEY=                   # WorkOS API key
WORKOS_CLIENT_ID=                 # WorkOS client ID
WORKOS_REDIRECT_URI=http://localhost:5173/auth/callback

# Database
DATABASE_URL=postgresql+asyncpg://nexus:nexus@localhost:5432/nexus

# Web Search (optional — enables search tool)
SERPAPI_API_KEY=                   # SerpAPI key (serpapi.com)

# Azure TTS (optional)
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=switzerlandnorth
```

---

## Docker Compose (Postgres)

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: nexus
      POSTGRES_PASSWORD: nexus
      POSTGRES_DB: nexus
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  pgadmin:
    image: dpage/pgadmin4
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@nexus.local
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      - postgres

volumes:
  pgdata:
```

---

## Database Schema

### `users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK, default `gen_random_uuid()` |
| `workos_id` | VARCHAR | Unique — WorkOS user ID |
| `email` | VARCHAR | From WorkOS profile |
| `name` | VARCHAR | Display name |
| `avatar_url` | VARCHAR | Profile picture URL |
| `created_at` | TIMESTAMPTZ | |
| `last_seen_at` | TIMESTAMPTZ | Updated on each request |

### `conversations`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users |
| `title` | VARCHAR | Auto-generated from first message, editable |
| `model` | VARCHAR | Last-used model ID |
| `agent_mode` | VARCHAR | `chat`, `code`, `architect` |
| `agent_persona_id` | UUID | FK → agent_personas (nullable — uses default if null) |
| `sandbox_id` | VARCHAR | Daytona sandbox ID (nullable — not all convos need one) |
| `sandbox_template` | VARCHAR | Template used: `python-data-science`, `python-general`, `nodejs`, `react-vite`, `blank` |
| `forked_from_message_id` | UUID | FK → messages (nullable — set when conversation is a fork) |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `messages`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `conversation_id` | UUID | FK → conversations |
| `role` | VARCHAR | `user`, `assistant`, `system`, `tool` |
| `content` | TEXT | Message text |
| `reasoning` | TEXT | Model thinking/reasoning trace (nullable — only for reasoning models) |
| `tool_calls` | JSONB | Tool call metadata (nullable) |
| `tool_result` | JSONB | Tool execution result (nullable) |
| `attachments` | JSONB | Uploaded file metadata: `[{name, sandbox_path, mime_type, size}]` |
| `feedback` | VARCHAR | `positive`, `negative`, or null |
| `token_count` | INTEGER | Approximate token usage |
| `cost_usd` | NUMERIC(10,6) | Estimated cost in USD (nullable) |
| `created_at` | TIMESTAMPTZ | |

### `artifacts`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `conversation_id` | UUID | FK → conversations |
| `message_id` | UUID | FK → messages (source message) |
| `type` | VARCHAR | `idea`, `code_snippet`, `file`, `diagram`, `command`, `preview_url` |
| `label` | VARCHAR | Short description |
| `content` | TEXT | Full content or file path |
| `metadata` | JSONB | Type-specific data (language, filename, port, etc.) |
| `pinned` | BOOLEAN | User-pinned artifacts persist across conversation clear |
| `created_at` | TIMESTAMPTZ | |

### `agent_personas`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users (creator) |
| `name` | VARCHAR | Display name (e.g., "Python Expert", "Code Reviewer") |
| `description` | TEXT | What this agent does |
| `system_prompt` | TEXT | Custom system prompt prepended to all messages |
| `default_model` | VARCHAR | Preferred model ID |
| `default_mode` | VARCHAR | `chat`, `code`, or `architect` |
| `icon` | VARCHAR | Emoji or icon identifier |
| `tools_enabled` | JSONB | Which tools this agent can use: `["execute_code", "web_search", ...]` |
| `is_public` | BOOLEAN | Visible to all users |
| `usage_count` | INTEGER | How many conversations have used this persona |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `usage_logs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users |
| `conversation_id` | UUID | FK → conversations |
| `model` | VARCHAR | Model ID used |
| `input_tokens` | INTEGER | |
| `output_tokens` | INTEGER | |
| `cost_usd` | NUMERIC(10,6) | Estimated cost |
| `sandbox_seconds` | INTEGER | Sandbox compute time (nullable) |
| `created_at` | TIMESTAMPTZ | |

---

## Authentication (WorkOS AuthKit)

### Flow
1. User hits the app → frontend checks for session cookie.
2. No session → redirect to WorkOS AuthKit hosted login page.
3. WorkOS handles login (email/password, Google OAuth, SSO, passkeys).
4. Callback → `GET /auth/callback?code=...` → backend exchanges code for WorkOS user profile.
5. Backend upserts user in Postgres, sets a signed HTTP-only session cookie (JWT).
6. All subsequent API requests include the cookie. Backend middleware validates JWT, attaches `current_user` to request.

### Backend Auth Middleware
- Decorator/dependency: `get_current_user(request)` — extracts and validates JWT from cookie.
- Returns 401 if missing/expired. Frontend catches 401 and redirects to login.
- JWT payload: `{ sub: user_id, email, exp }`. Signed with a server-side secret.
- Token lifetime: 7 days. Frontend silently refreshes by re-authenticating with WorkOS if nearing expiry.

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/login` | Redirects to WorkOS AuthKit |
| `GET` | `/auth/callback` | Handles OAuth callback, sets session cookie |
| `POST` | `/auth/logout` | Clears session cookie |
| `GET` | `/auth/me` | Returns current user profile |

---

## Backend

### Stack

- **Python 3.12+** with **FastAPI**, managed by **uv**
- **SQLAlchemy 2.0** (async) + **Alembic** for migrations
- **asyncpg** — async Postgres driver
- **Daytona SDK** (`daytona-sdk`) — sandbox creation and management
- **LiteLLM** or **openai** SDK — LLM calls via proxy
- **WorkOS Python SDK** (`workos`) — authentication
- **PyJWT** — session token signing
- **SerpAPI** (`serpapi`) — web search via Google/Bing (optional)
- `python-dotenv` + `pydantic-settings` for config
- `CORSMiddleware` allowing Vite dev origin

### Agent Modes

The AI operates in one of three modes, selectable per conversation:

| Mode | Behavior |
|------|----------|
| **Chat** | Pure conversational AI. No sandbox, no code execution. Fast, cheap. Tools: web search only. |
| **Code** | AI writes code and executes it in a Daytona sandbox. Shows terminal output, generated files, and results inline. The AI can iterate — if code fails, it reads the error and tries again. Full tool access. |
| **Architect** | AI plans multi-step implementations. Generates a numbered step-by-step plan, then executes each step in the sandbox with user approval gates between steps. Produces a full project as output. Shows a progress tracker in the UI. |

### Agent Loop (Code & Architect modes)

```
User message (+ optional file attachments)
    ↓
Upload attachments to sandbox filesystem (if any)
    ↓
LLM call (with tool definitions + conversation history)
    ↓
┌─ Tool dispatch loop (may iterate multiple times) ───┐
│                                                      │
│  execute_code  → Daytona SDK → stream output via WS  │
│  write_file    → Daytona SDK → confirm to LLM        │
│  read_file     → Daytona SDK → return contents        │
│  list_files    → Daytona SDK → return tree            │
│  web_search    → SerpAPI → return results              │
│  preview_app   → Daytona port forward → return URL    │
│                                                      │
│  Each tool result is fed back to LLM.                │
│  LLM decides: respond to user, or call another tool. │
└──────────────────────────────────────────────────────┘
    ↓
Final LLM response → streamed to user via SSE
    ↓
Persist message + tool calls to Postgres
    ↓
Extract artifacts (background, async)
    ↓
Log usage (tokens, cost, sandbox time)
```

### Tool Definitions (for function-calling models)

```json
[
  {
    "name": "execute_code",
    "description": "Execute code in the sandbox. Supports Python, TypeScript, JavaScript, and shell commands.",
    "parameters": {
      "language": "python | typescript | javascript | shell",
      "code": "string — the code to execute"
    }
  },
  {
    "name": "write_file",
    "description": "Write or overwrite a file in the sandbox filesystem.",
    "parameters": {
      "path": "string — absolute path in sandbox",
      "content": "string — file content"
    }
  },
  {
    "name": "read_file",
    "description": "Read a file from the sandbox filesystem.",
    "parameters": {
      "path": "string — absolute path in sandbox"
    }
  },
  {
    "name": "list_files",
    "description": "List files and directories at a given path in the sandbox.",
    "parameters": {
      "path": "string — directory path (default: /home/daytona)"
    }
  },
  {
    "name": "web_search",
    "description": "Search the web for current information. Returns top results with snippets.",
    "parameters": {
      "query": "string — search query"
    }
  },
  {
    "name": "preview_app",
    "description": "Start a preview of a web application running in the sandbox. Returns a URL the user can open.",
    "parameters": {
      "port": "number — the port the app is listening on inside the sandbox",
      "label": "string — display label (e.g., 'React App', 'FastAPI Docs')"
    }
  }
]
```

### Sandbox Management (Daytona)

- **Lazy creation:** Sandbox is created on first tool call, not on conversation start.
- **Lifecycle:** Sandbox stays alive for the duration of the conversation. Auto-stops after 15 minutes of inactivity (Daytona default). Can be manually stopped/started.
- **Snapshots:** Users can snapshot a sandbox at any point. Snapshots are stored by Daytona and can be forked into new conversations — full filesystem + environment state preserved.
- **Resource defaults:** 2 vCPU, 2GB RAM, 5GB disk per sandbox.
- **Labels:** Each sandbox is labeled with `user_id` and `conversation_id` for tracking.
- **Port forwarding / Preview:** Daytona exposes sandbox ports. When the AI starts a web server inside the sandbox, it calls `preview_app` with the port — Nexus generates a proxied URL the user can view in the embedded preview panel or open in a new tab.
- **Output directory convention:** The AI is instructed to save generated images/charts to `/home/daytona/output/`. After each `execute_code` call, the backend checks this directory for new files (PNG, SVG, HTML) and streams them back as inline embeds.

#### Sandbox Templates

Pre-configured sandbox environments that skip dependency installation. Templates are Daytona sandbox configs with pre-installed packages.

| Template | Pre-installed | Use case |
|----------|--------------|----------|
| **Python Data Science** | `pandas`, `numpy`, `matplotlib`, `seaborn`, `plotly`, `scikit-learn`, `scipy`, `openpyxl` | Data analysis, visualization, ML |
| **Python General** | `requests`, `beautifulsoup4`, `fastapi`, `sqlalchemy`, `pydantic` | Web scraping, APIs, scripting |
| **Node.js** | `express`, `typescript`, `tsx`, `axios`, `zod` | Backend JS/TS development |
| **React + Vite** | `react`, `react-dom`, `vite`, `typescript`, `tailwindcss` | Frontend prototyping |
| **Blank** | Minimal (Python 3.12 + Node 20) | Custom setups |

- Template selected automatically based on the agent persona or first message intent (e.g., "analyze this CSV" → Python Data Science).
- Can also be selected manually from the sandbox status pill menu or command palette.
- Templates dramatically reduce first-response latency since `pip install pandas matplotlib` takes 10+ seconds cold.

#### Sandbox Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sandboxes` | Create a new sandbox (or attach existing) |
| `GET` | `/api/sandboxes/:id` | Get sandbox status + resource usage |
| `POST` | `/api/sandboxes/:id/execute` | Execute code (returns streaming output) |
| `GET` | `/api/sandboxes/:id/files` | List files at path |
| `GET` | `/api/sandboxes/:id/files/content` | Read file content |
| `PUT` | `/api/sandboxes/:id/files/content` | Write file content |
| `POST` | `/api/sandboxes/:id/upload` | Upload file(s) from user to sandbox filesystem |
| `GET` | `/api/sandboxes/:id/download` | Download file or directory as ZIP |
| `POST` | `/api/sandboxes/:id/snapshot` | Create a snapshot |
| `POST` | `/api/sandboxes/:id/fork` | Fork from snapshot into new sandbox |
| `GET` | `/api/sandboxes/:id/output` | List new files in /home/daytona/output/ since last check |
| `GET` | `/api/sandboxes/:id/output/:filename` | Serve a generated file (PNG/SVG/HTML) for inline embed |
| `GET` | `/api/sandboxes/:id/preview/:port` | Proxy to running app inside sandbox |
| `POST` | `/api/sandboxes/:id/stop` | Stop sandbox |
| `POST` | `/api/sandboxes/:id/start` | Start stopped sandbox |
| `DELETE` | `/api/sandboxes/:id` | Delete sandbox |

### Chat Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/conversations` | Create conversation |
| `GET` | `/api/conversations` | List user's conversations (paginated, searchable) |
| `GET` | `/api/conversations/:id` | Get conversation with messages |
| `PATCH` | `/api/conversations/:id` | Update title, model, mode, persona |
| `DELETE` | `/api/conversations/:id` | Delete conversation + cleanup sandbox |
| `POST` | `/api/conversations/:id/messages` | Send message → SSE stream response |
| `POST` | `/api/conversations/:id/messages/:mid/fork` | Fork conversation from this message into a new conversation |
| `POST` | `/api/conversations/:id/messages/:mid/edit` | Edit a user message and regenerate from that point (creates fork) |
| `POST` | `/api/conversations/:id/messages/:mid/feedback` | Submit thumbs up/down on a message |
| `POST` | `/api/conversations/:id/messages/:mid/regenerate` | Regenerate an assistant response |
| `GET` | `/api/conversations/:id/artifacts` | List artifacts for conversation |
| `DELETE` | `/api/artifacts/:id` | Delete artifact |
| `PATCH` | `/api/artifacts/:id` | Toggle pin, edit label |

### Agent Persona Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agents` | Create a custom agent persona |
| `GET` | `/api/agents` | List user's personas + public personas |
| `GET` | `/api/agents/:id` | Get persona details |
| `PATCH` | `/api/agents/:id` | Update persona |
| `DELETE` | `/api/agents/:id` | Delete persona (only creator) |
| `GET` | `/api/agents/public` | Browse public agent personas |
| `POST` | `/api/agents/:id/duplicate` | Clone a public persona into user's own |

### User Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/users/me` | Current user profile |
| `GET` | `/api/users/me/usage` | Usage stats: tokens, cost, sandbox hours (current period) |
| `GET` | `/api/users/me/usage/history` | Usage over time (for charts) |

### TTS Endpoint (optional)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/tts` | Azure TTS — returns MP3 audio stream |

---

## Frontend

### Stack

- **Vite** with **vanilla TypeScript** (no framework)
- **marked** — markdown rendering
- **shiki** — syntax highlighting (better theme support than highlight.js)
- **mermaid** — diagram rendering (lazy-loaded, only initialized when a mermaid block is detected)
- **xterm.js** — terminal emulator for sandbox output
- **KaTeX** — math equation rendering in markdown
- No UI framework dependencies

### Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌─ Top Bar ──────────────────────────────────────────────────────────────┐ │
│  │  NEXUS.  [model ▾] [Chat|Code|Arch] [persona ▾]  ◉ sandbox   [⌘K] 👤 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│  ┌─ Sidebar ──┬─ Main Panel ──────────────────┬─ Right Panel ────────────┐ │
│  │            │                                │                          │ │
│  │ [🔍 Search]│    Chat Messages               │  ┌─ Tabs ─────────────┐ │ │
│  │            │                                │  │ Terminal│Files│     │ │ │
│  │ ─────────  │    [user message]              │  │ Preview│Artifacts   │ │ │
│  │            │    [file attachment chips]      │  ├─────────────────────┤ │ │
│  │ Agents ▾   │                                │  │                     │ │ │
│  │  🐍 Python │    [assistant response         │  │  xterm.js terminal  │ │ │
│  │  📝 Review │     with inline execution      │  │  or file tree       │ │ │
│  │  🏗️ Archit │     blocks and diffs]          │  │  or live preview    │ │ │
│  │            │                                │  │  or artifacts       │ │ │
│  │ ─────────  │    [reasoning trace ▸]         │  │                     │ │ │
│  │            │                                │  │                     │ │ │
│  │ Today      │    [tool execution with        │  │                     │ │ │
│  │  Conv 1    │     live terminal embed]       │  │                     │ │ │
│  │  Conv 2 🔀 │                                │  │                     │ │ │
│  │            │    [assistant response          │  │                     │ │ │
│  │ Yesterday  │     with preview embed]        │  │                     │ │ │
│  │  Conv 3    │                                │  │                     │ │ │
│  │            │  ┌──────────────────────────┐  │  │                     │ │ │
│  │ This week  │  │ 📎 Drop files or type... │  │  │                     │ │ │
│  │  Conv 4    │  │              🎤  Send →  │  │  │                     │ │ │
│  │            │  └──────────────────────────┘  │  └─────────────────────┘ │ │
│  │ [+ New]    │                                │                          │ │
│  └────────────┴────────────────────────────────┴──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Design System

Inspired by Daytona's developer-focused aesthetic — clean, technical, precise. Dark-first with a signature green accent.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0A0A0A` | Page background — near-black |
| `--surface-0` | `#111111` | Primary surface (sidebar, panels) |
| `--surface-1` | `#1A1A1A` | Elevated surface (cards, inputs) |
| `--surface-2` | `#222222` | Hover states, active selections |
| `--border` | `#2A2A2A` | Default borders |
| `--border-subtle` | `#1E1E1E` | Subtle dividers |
| `--border-focus` | `#3A3A3A` | Focus ring / active border |
| `--text` | `#ECECEC` | Primary text |
| `--text-secondary` | `#888888` | Secondary text, labels |
| `--text-tertiary` | `#555555` | Disabled text, timestamps |
| `--accent` | `#00E599` | Primary accent — Daytona green |
| `--accent-dim` | `#00E59920` | Accent at 12% opacity — backgrounds, glows |
| `--accent-hover` | `#00FFB2` | Accent hover state |
| `--error` | `#FF5555` | Error states, destructive actions |
| `--warning` | `#FFAA33` | Warnings |
| `--info` | `#5599FF` | Informational |
| **Font — UI** | `Inter` | All interface text |
| **Font — Code** | `IBM Plex Mono` | Terminal, code blocks, file paths, technical labels |

**Design Rules:**
- No gradients on surfaces. Flat, sharp, layered.
- Depth via surface elevation only (`surface-0` → `surface-1` → `surface-2`).
- `1px solid var(--border)` everywhere. No shadows except very subtle ones on modals.
- Monospace font for anything "technical" — file paths, model IDs, sandbox labels, code.
- Accent green used sparingly: active states, status indicators, primary CTAs. Not for decoration.
- When something is running/alive, it glows green. When stopped/dead, it grays out.
- Generous padding (16–24px). Tight line-height in code (1.4), relaxed in prose (1.6).
- Scrollbars: thin, styled. `scrollbar-width: thin; scrollbar-color: var(--border) transparent`.

### Components

#### Top Bar
- **Brand:** `NEXUS` in IBM Plex Mono, 600 weight, 13px, `letter-spacing: 0.15em`. The trailing period is `--accent` green and pulses softly when the AI is processing.
- **Model Picker:** Dropdown showing current model. Options:
  | Label | Model ID |
  |-------|----------|
  | Claude Sonnet | `azure_ai/claude-sonnet-4-5-swc` |
  | GPT-4o | `azure/gpt-4o` |
  | Llama 4 Maverick | `azure_ai/Llama-4-Maverick-17B-128E-Instruct-FP8` |
- **Agent Mode Toggle:** Segmented control — `Chat` | `Code` | `Architect`. Active segment: accent green text + subtle green underline. Switching mid-conversation is allowed.
- **Persona Picker:** Dropdown showing current agent persona. "Default" + user's custom personas + starred public ones. Shows persona icon + name.
- **Sandbox Status:** Shows when a sandbox is active. Pill with green dot = running, gray = stopped, hidden = no sandbox. Shows resource usage on hover (CPU, RAM, uptime). Click to open sandbox actions menu (stop, snapshot, fork, download as ZIP, delete).
- **Command Palette Trigger:** `⌘K` button that opens the command palette.
- **User Avatar:** Small circle, top-right. Click → dropdown with email, usage summary, "Sign out".

#### Command Palette (⌘K)
- Modal overlay with search input, auto-focused.
- Fuzzy-matches against actions:
  - **Conversations:** "New conversation", "Search conversations...", recent conversations by name.
  - **Agent modes:** "Switch to Code mode", "Switch to Chat mode", "Switch to Architect mode".
  - **Models:** "Switch to Claude Sonnet", "Switch to GPT-4o", etc.
  - **Personas:** "Use Python Expert", "Use Code Reviewer", etc.
  - **Sandbox:** "Stop sandbox", "Snapshot sandbox", "Fork sandbox", "Download project".
  - **Navigation:** "Open agents", "View usage stats".
- Results grouped by category with keyboard navigation (↑↓ to select, Enter to execute, Esc to close).
- Monospace font for shortcut hints on the right side of each result.
- `surface-1` background, `border` border, slight `box-shadow` for elevation.

#### Conversation Sidebar
- **Two sections, collapsible:**
  1. **Agent Personas** — shows favorited/recent personas as small icon+name pills. Click to start a new conversation with that persona.
  2. **Conversations** — search + date-grouped history.
- Search input at the top with `IBM Plex Mono` placeholder text. Searches conversation titles and message content (server-side).
- Conversations grouped by date: **Today**, **Yesterday**, **This week**, **Older**.
- Each item shows: title (truncated), model icon, agent mode badge, relative timestamp. Forked conversations show a 🔀 icon.
- Active conversation: `surface-2` background, `--accent` left border (2px).
- Hover: `surface-1` background.
- Context menu (right-click or `...` button): Rename, Delete, Duplicate, Fork from here.
- **"+ New conversation"** button at bottom with accent green icon.

#### Chat Messages
- **User messages:** Right-aligned. `surface-1` background, `border` border, rounded corners (8px). Max-width 75%.
  - **File attachment chips** below message text: small pills with filename + icon. Click to open in file viewer.
  - **Edit button** (pencil icon) on hover — clicking opens inline editor. On submit, forks the conversation from that point (old messages preserved, new branch created).
  - **Fork button** (branch icon) on hover — forks the conversation from this message into a new conversation with the same sandbox snapshot.
- **Assistant messages:** Left-aligned. No background, no border. Full width. Slightly larger text (15px vs 14px).
  - **Reasoning trace:** If the model returned reasoning/thinking, show a collapsible "Reasoning" section above the response. Collapsed by default. Header: "Reasoning" + token count badge. Content: dimmed monospace text.
  - **Feedback buttons:** Thumbs up / thumbs down on hover, bottom-right of message. Filled state when selected. Data persisted to DB.
  - **Regenerate button:** Circular arrow icon on hover. Re-sends the same context to the LLM and replaces this response (old response discarded).
  - **Copy button:** Copy full message as markdown.
- Rendered as markdown via `marked` + `shiki` for code blocks (theme: custom dark theme with green accents) + `KaTeX` for math + `mermaid` for diagrams.
- **Inline code execution blocks:** When the AI uses a tool, the chat shows a collapsible execution block:
  ```
  ┌─ Executing Python ──────────────────── ▸ ─┐
  │  import pandas as pd                      │
  │  df = pd.read_csv("data.csv")             │
  │  print(df.describe())                     │
  │                                           │
  │  ─── Output ───────────────────────────── │
  │                count   mean   std          │
  │  price        1000    42.5   12.3         │
  │  quantity     1000    7.2    3.1          │
  │                                           │
  │  ✓ Exited with code 0           0.8s      │
  └───────────────────────────────────────────┘
  ```
  - Header shows language + expand/collapse toggle + execution time.
  - Code section: syntax highlighted.
  - Output section: monospace, green text for stdout, red for stderr.
  - Footer: exit code badge (green checkmark for 0, red × otherwise) + duration.
  - While running: pulsing green border on the left + live-updating output.
  - Collapsed by default after execution completes (user can expand).
- **Inline diff blocks:** When the AI modifies an existing file, show a compact diff view:
  ```
  ┌─ Modified: src/app.py ────────────── ▸ ─┐
  │  - old_line                             │
  │  + new_line                             │
  │  3 additions, 1 deletion                │
  └─────────────────────────────────────────┘
  ```
- **Inline preview embeds:** When the AI calls `preview_app`, show an inline preview card:
  ```
  ┌─ Live Preview: React App ─── ↗ ────────┐
  │  ┌──────────────────────────────────┐   │
  │  │                                  │   │
  │  │   [iframe of running app]        │   │
  │  │                                  │   │
  │  └──────────────────────────────────┘   │
  │  localhost:3000 via sandbox              │
  └─────────────────────────────────────────┘
  ```
  - Embedded iframe (sandboxed, 400px tall).
  - "↗" button opens in new tab (full-size).
  - Shows the proxied URL below the frame.
- **Web search results:** When the AI uses `web_search`, show a compact results block:
  ```
  ┌─ Web Search: "fastapi websocket tutorial" ─┐
  │  → FastAPI WebSocket docs (fastapi.tiangolo.com)  │
  │  → Real-time apps with FastAPI (testdriven.io)    │
  │  → 3 more results                                 │
  └────────────────────────────────────────────────────┘
  ```

- **Inline chart/image embeds:** When the AI generates a chart via matplotlib/plotly/etc., the image appears directly in the chat:
  ```
  ┌─ Chart: Revenue by Quarter ──── 💾 ───┐
  │                                        │
  │   [rendered PNG/SVG image]             │
  │                                        │
  │   800 × 500 · matplotlib · 42 KB      │
  └────────────────────────────────────────┘
  ```
  - Image served from `/api/sandboxes/:id/output/:filename` and displayed inline.
  - Click to open full-size in a lightbox overlay.
  - 💾 button to download the image file.
  - Metadata footer: dimensions, library used, file size.
  - **How it works:** After each `execute_code` call, backend scans `/home/daytona/output/` for new PNG/SVG/HTML files. New files are streamed to the frontend as `image_output` SSE events during the response. System prompts instruct the AI to `plt.savefig("/home/daytona/output/chart.png")` (or equivalent).

- **Mermaid diagrams:** When the AI writes a `mermaid` fenced code block in its markdown response, it renders as an interactive SVG diagram instead of a code block:
  ```
  ┌─ Diagram ──────────────────────────────┐
  │                                        │
  │   [rendered mermaid SVG]               │
  │   flowchart, sequence, ER, class, etc. │
  │                                        │
  │   📋 Copy source    💾 Download SVG    │
  └────────────────────────────────────────┘
  ```
  - Rendered client-side via the `mermaid` library (lazy-loaded on first use).
  - Dark theme matching the design system (`--bg` background, `--accent` for highlights, `--text` for labels).
  - Supported diagram types: flowchart, sequence, class, ER, gantt, pie, state, git graph.
  - Fallback: if rendering fails, show the raw mermaid source as a code block.
  - Copy source button: copies the mermaid source text.
  - Download SVG button: exports the rendered diagram as an SVG file.

- **Rich data tables:** When the AI prints a dataframe (pandas `.to_string()`, `.to_markdown()`, or CSV output), the frontend detects tabular patterns and renders them as styled, interactive tables instead of monospace text:
  ```
  ┌─ Data: df.describe() ─── 📋 ─── 💾 ───┐
  │                                         │
  │  Column   │ count │  mean  │  std       │
  │  ─────────┼───────┼────────┼──────────  │
  │  price    │ 1000  │ 42.50  │ 12.30     │
  │  quantity │ 1000  │  7.20  │  3.10     │
  │  revenue  │ 1000  │ 306.00 │ 89.50     │
  │                                         │
  │  3 columns × 1000 rows (showing 10)     │
  └─────────────────────────────────────────┘
  ```
  - `surface-1` background, `border` row separators.
  - Column headers: `IBM Plex Mono`, bold, sticky top.
  - Numeric columns right-aligned, text left-aligned.
  - **Sortable columns:** click header to sort ascending/descending. Small ▲/▼ indicator.
  - **Truncation:** large tables show first 20 rows with "Show all N rows" expand button.
  - 📋 button: copy table as TSV (pasteable into Excel/Sheets).
  - 💾 button: download as CSV file.
  - **Detection heuristic:** Backend post-processes tool output. If output contains pipe-delimited or whitespace-aligned columns (3+ rows, 2+ columns), it's marked as `table` type in the SSE event. Frontend renders accordingly. Fallback: monospace text.

- **Cost badge:** Every assistant message shows a small, unobtrusive cost indicator:
  ```
  ↳ 1,247 tokens · $0.0038 · claude-sonnet · 2.1s
  ```
  - Positioned bottom-left of the message, `--text-tertiary` color, `IBM Plex Mono`, 11px.
  - Shows: token count (input + output combined), estimated cost in USD, model used, response time.
  - Hover for breakdown: input tokens, output tokens, cost per token tier.
  - Cost calculated from per-model pricing table maintained in backend config.

- **TTS:** Small speaker icon after each assistant message. Pulses with green glow while playing.

#### Architect Mode — Step Tracker
- When in Architect mode, the AI generates a numbered plan before executing.
- A **step tracker** appears above the chat input:
  ```
  ┌─ Plan: Build REST API ──────────────────────────────────┐
  │  ✓ 1. Project setup     ✓ 2. Models     ▸ 3. Routes    │
  │  ○ 4. Tests             ○ 5. Deploy config              │
  │                                        [Approve next →] │
  └─────────────────────────────────────────────────────────┘
  ```
- Steps: ✓ = completed, ▸ = current (pulsing green), ○ = pending.
- "Approve next" button to let the AI proceed to the next step.
- User can click any pending step to skip ahead or re-order.

#### Terminal Panel (Right Panel — Tab 1)
- Full **xterm.js** terminal emulator.
- Streams live stdout/stderr from sandbox executions via WebSocket.
- Green-on-dark theme matching the design system.
- Scrollback buffer: 5000 lines.
- Shows a connection status indicator (green dot = connected, gray = disconnected).
- **Clear** button in tab header.

#### File Browser (Right Panel — Tab 2)
- Tree view of the sandbox filesystem.
- File-type icons (folder, Python, JS/TS, JSON, markdown, image, etc. — simple SVG icons, not emoji).
- Click a file → opens in the **File Viewer** (replaces tree with back button).
- File viewer: full syntax highlighting via `shiki`, read-only display, line numbers.
- **Download** button on individual files. **Download all** (ZIP) button in tree header.
- Files that were recently modified by the AI are highlighted with a subtle green indicator for 30 seconds.
- **Upload** button in tree header — opens file picker to upload files from local machine to sandbox.

#### Live Preview Panel (Right Panel — Tab 3)
- Shows when the AI has called `preview_app`.
- Full iframe rendering the running web application from the sandbox.
- **URL bar** at the top (read-only, shows the proxied URL).
- **Refresh** button to reload the iframe.
- **Open in new tab** button.
- **Responsive toggles:** desktop (full-width) / tablet (768px) / mobile (375px) — resize the iframe to test responsiveness.
- When no preview is active: empty state with "No app running. The AI will start a preview when it runs a web server."

#### Artifacts Panel (Right Panel — Tab 4)
- After each assistant message, backend extracts artifacts (ideas, code snippets, notable outputs, preview URLs).
- Each artifact is a card:
  - `surface-1` background.
  - 3px left border in accent green.
  - Type badge (idea, code, file, command, preview) in `IBM Plex Mono`, tiny, uppercase.
  - Label text.
  - Pin icon (pinned artifacts survive conversation clear).
  - "×" dismiss button.
- **"Copy all"** button — copies all artifact labels as markdown list.
- **"Export"** button — downloads artifacts as JSON.
- Cards animate in: `scale(0.97→1)` + `opacity: 0→1`, 200ms ease-out, staggered 50ms.

#### Empty State (new conversation)
- Center of chat area.
- `NEXUS` wordmark large (48px, IBM Plex Mono, 300 weight, `--text-tertiary`).
- Tagline: "Your AI. Your sandbox. Your rules." — Inter, 18px, `--text-secondary`.
- **Template pills** in a row: `🐍 Data Science` | `⚡ Node.js` | `⚛️ React` | `📦 Blank` — clicking one pre-selects the sandbox template for the next conversation.
- If user has custom personas, show them as a second row of icon pills: "Start with: 🐍 Python Expert | 📝 Code Reviewer | 🏗️ Architect"
- Below that, three starter chips in a row (data-analysis-forward):
  - "Analyze this CSV and visualize trends"
  - "Build me a REST API in Python"
  - "Explain this codebase architecture with diagrams"
- Chips: `surface-1` background, `border` border, rounded (20px). On hover: `surface-2` + accent border.
- Below chips: small text — "Code mode runs in an isolated Daytona sandbox" with a green dot.
- **Clicking a chip sends the message immediately** and auto-selects **Code** agent mode.

#### Input Area
- Textarea spanning the chat column width.
- `surface-1` background, `border` border → `border-focus` on focus (150ms transition).
- Placeholder: `"Message Nexus..."` in `--text-tertiary`.
- **Enter** sends, **Shift+Enter** newline.
- **File upload:** Drag files onto the textarea (or the entire chat area) → drop zone overlay appears ("Drop files to upload to sandbox"). Files are shown as removable chips above the textarea before sending. On send, files are uploaded to the sandbox and referenced in the message.
- Supported upload types: any text file, PDF, CSV, images (PNG/JPG/SVG), archives (ZIP/tar.gz). Max 20MB per file, max 10 files.
- Right side icons: paperclip (file picker), microphone (if supported), send arrow (accent green when text/files present, tertiary when empty).
- Above textarea when in Code/Architect mode: small pill showing sandbox state ("Sandbox running — 2 vCPU, 2GB RAM" or "No sandbox — will create on first code execution").

#### Voice Input
- Same as original: Web Speech API, Chromium only, hide if unsupported.
- Recording state: mic icon pulses with accent green glow ring.

#### Agent Persona Editor (separate view: `/agents`)
- **List view:** grid of persona cards. Each card shows icon, name, description (truncated), usage count, public/private badge.
- **Editor view** (slide-over panel or dedicated page):
  - Icon picker (emoji grid).
  - Name input.
  - Description textarea.
  - **System prompt editor** — large monospace textarea with syntax-like styling. Placeholder shows an example prompt.
  - Default model dropdown.
  - Default mode selector (Chat / Code / Architect).
  - Tool toggles: checkboxes for each available tool (execute_code, write_file, read_file, list_files, web_search, preview_app).
  - Public toggle: share this persona with all users.
  - **"Try it"** button — opens a new conversation with this persona immediately.
  - **Save / Delete** buttons.
- **Public persona browser:** separate tab showing community-shared personas. "Use" button clones into user's collection.

#### Login Page
- Centered card on dark background.
- `NEXUS.` brand top-center, large.
- "Sign in to continue" subtext.
- Single "Continue with WorkOS" button (accent green, full-width).
- Optionally shows available auth methods (Google, email, SSO) depending on WorkOS config.
- Minimal, no distractions.

#### Usage Stats (dropdown from avatar or dedicated page)
- Summary card: total conversations, total messages, total tokens, total cost, total sandbox hours (current billing period).
- **Usage chart:** line/bar chart showing daily usage over the last 30 days (tokens + cost). Built with simple inline SVG — no chart library dependency.
- **Model breakdown:** table showing usage per model.
- **Top conversations** by cost.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘N` / `Ctrl+N` | New conversation |
| `⌘⇧F` / `Ctrl+Shift+F` | Search conversations |
| `⌘1` / `Ctrl+1` | Switch to Chat mode |
| `⌘2` / `Ctrl+2` | Switch to Code mode |
| `⌘3` / `Ctrl+3` | Switch to Architect mode |
| `Esc` | Close command palette / cancel current action |
| `⌘Enter` | Send message (alternative to Enter) |
| `⌘⇧S` / `Ctrl+Shift+S` | Snapshot sandbox |

### Animations

| Element | Animation | Duration |
|---------|-----------|----------|
| New messages | `translateY(6px)` + `opacity: 0→1` | 200ms ease-out |
| `NEXUS.` period | Green pulse while AI processing | continuous, 2s cycle |
| Execution blocks (running) | Left border green pulse | continuous |
| Artifact cards | `scale(0.97→1)` + `opacity: 0→1` staggered | 200ms per card |
| Input border focus | `border` → `border-focus` | 150ms |
| Sandbox status dot | Soft pulse when running | continuous, 3s cycle |
| Terminal cursor | Standard block cursor blink | 600ms |
| Panel tab switch | Crossfade | 150ms |
| Sidebar conversation switch | Instant (no transition — snappy) | 0ms |
| Starter chip hover | Border color → accent | 150ms |
| Command palette open | `scale(0.98→1)` + `opacity: 0→1` | 150ms ease-out |
| Command palette close | `opacity: 1→0` | 100ms |
| File drop zone | Overlay fade in + dashed border pulse | 200ms |
| Preview iframe load | Skeleton shimmer → content fade-in | 300ms |
| Step tracker progress | Step icon transition ○ → ▸ → ✓ | 300ms |
| Reasoning trace expand | Height auto-animate + fade | 200ms |
| Diff highlight | Green/red line background fade-in | 150ms |
| Inline chart load | Skeleton shimmer (surface-2) → image fade-in | 300ms |
| Mermaid render | Skeleton → SVG fade-in | 250ms |
| Data table rows | Staggered `opacity: 0→1` per row | 30ms per row, max 300ms |
| Table sort | Column reorder with `translateY` | 150ms |
| Cost badge | Fade in after message completes | 300ms, 200ms delay |
| Lightbox open | Backdrop fade + image `scale(0.9→1)` | 200ms |

All CSS-only where possible. No spring physics, no bounce. Engineer-grade: fast, crisp, intentional.

---

## SSE Stream Format (Chat Response)

`POST /api/conversations/:id/messages` returns an SSE stream. Each event is `data: {json}\n\n`.

| Event type | Payload | Frontend behavior |
|------------|---------|-------------------|
| `token` | `{ content: "word" }` | Append to streaming message |
| `reasoning` | `{ content: "thinking..." }` | Append to reasoning trace (collapsed) |
| `tool_start` | `{ tool: "execute_code", params: {...} }` | Show execution block header, start pulsing |
| `tool_output` | `{ tool: "execute_code", stdout/stderr: "..." }` | Stream into execution block output |
| `tool_end` | `{ tool: "execute_code", exit_code: 0, duration_ms: 800 }` | Close execution block, show exit badge |
| `image_output` | `{ filename: "chart.png", url: "/api/sandboxes/.../output/chart.png", width, height, size_bytes }` | Render inline image embed |
| `table_output` | `{ headers: [...], rows: [[...], ...], total_rows: 1000, source: "df.describe()" }` | Render rich data table |
| `preview` | `{ url: "...", port: 3000, label: "React App" }` | Show inline preview embed, open Preview tab |
| `search_results` | `{ query: "...", results: [{title, url, snippet}] }` | Show search results block |
| `done` | `{ token_count: { input, output }, cost_usd, model, duration_ms }` | Finalize message, show cost badge |
| `error` | `{ message: "..." }` | Show error indicator |

The `table_output` event is emitted when the backend detects structured tabular data in tool output. Detection runs server-side to keep the frontend simple — backend parses pandas `.to_string()`, `.to_markdown()`, pipe-delimited, and CSV-like patterns.

The `image_output` event is emitted when new files appear in `/home/daytona/output/` after an `execute_code` call. Backend checks the directory diff before and after execution.

---

## WebSocket: Terminal Streaming

`ws://localhost:8000/ws/sandbox/{sandbox_id}/terminal`

- Authenticated via session cookie (validated on connect).
- Streams sandbox execution output in real-time.
- Message format:
  ```json
  { "type": "stdout" | "stderr" | "exit", "data": "...", "exit_code": 0 }
  ```
- Frontend pipes `stdout`/`stderr` into xterm.js terminal.
- On `exit`: show exit code badge (green for 0, red otherwise).

---

## `run.sh`

```bash
#!/bin/bash
# Starts Postgres (Docker), runs migrations, starts backend + frontend.
```

1. `docker compose up -d postgres` — start Postgres
2. Wait for Postgres to be ready (`pg_isready` loop)
3. `cd backend && uv sync` — install Python deps
4. `uv run alembic upgrade head` — run migrations
5. `cd frontend && npm install` — install JS deps
6. Start FastAPI with `uvicorn` on port 8000 (background, with `--reload`)
7. Start Vite dev server on port 5173 (foreground)
8. Trap to kill backend + stop Docker on exit

---

## Key Behaviors

### Conversation Lifecycle
1. User creates a new conversation (or clicks starter chip or persona).
2. Frontend sends message to `POST /api/conversations/:id/messages` (with optional file attachments).
3. If files attached: backend uploads them to sandbox filesystem first, includes paths in context.
4. Backend streams SSE response. If the LLM emits tool calls, backend executes them against the Daytona sandbox and feeds results back to the LLM in a loop.
5. Each tool execution also streams to the WebSocket for live terminal display.
6. Final response, tool calls, and artifacts are persisted to Postgres.
7. Conversation appears in sidebar with auto-generated title.

### Conversation Forking
- **Edit + fork:** User edits a past message → backend creates a new conversation, copies messages up to (but not including) the edited one, inserts the new message, and regenerates the response. Old conversation is untouched.
- **Manual fork:** User clicks fork icon on any message → backend creates a new conversation from that point with a snapshot of the current sandbox state.
- Fork indicator: forked conversations show a 🔀 icon in the sidebar and a "Forked from [original title]" note at the top of the chat.

### Sandbox Lifecycle
1. Created lazily on first tool call in Code/Architect mode.
2. Sandbox ID stored on the conversation record.
3. Active while user is chatting. Auto-stops after 15 min idle (Daytona-managed).
4. User can manually stop/start from the sandbox status pill.
5. Snapshots are point-in-time captures — can be forked into new conversations.
6. On conversation delete: sandbox is also deleted (with confirmation).
7. **Download:** Users can download the entire sandbox project as a ZIP at any time.

### File Upload Flow
1. User drags files onto input area (or clicks paperclip icon).
2. Files appear as removable chips above the textarea.
3. On message send: files are uploaded to sandbox via `POST /api/sandboxes/:id/upload`.
4. File paths in sandbox are included in the user message context sent to the LLM.
5. LLM can then read/process these files using its tools.
6. File metadata (name, path, type, size) stored in the message's `attachments` JSONB field.

### Live App Preview Flow
1. AI writes code for a web application (e.g., React, Flask, Express).
2. AI calls `execute_code` to install dependencies and start the dev server.
3. AI calls `preview_app(port=3000, label="React App")`.
4. Backend registers the port with Daytona's port forwarding. Returns a proxied URL.
5. Frontend opens the Preview tab and loads the URL in a sandboxed iframe.
6. User sees the running app. Can interact with it, resize viewport, open in new tab.
7. Preview URL is also saved as an artifact.

### System Prompt Conventions

All system prompts (base + persona) include these output conventions so the sandbox image/table pipeline works:

```
When generating charts or visualizations:
- Always save figures to /home/daytona/output/ (e.g., plt.savefig("/home/daytona/output/chart.png", dpi=150, bbox_inches="tight"))
- Prefer PNG for raster charts, SVG for diagrams. Use transparent=False with dark background (#0A0A0A) or white background depending on context.
- For plotly, use fig.write_image("/home/daytona/output/chart.png") or fig.write_html("/home/daytona/output/chart.html").
- Use seaborn's darkgrid or dark theme for matplotlib to match the UI aesthetic.

When presenting tabular data:
- Use print(df.to_markdown(index=False)) for clean table output that the UI will render as a rich table.
- For large dataframes, show .head(20) and mention total row count.

When explaining architecture or flows:
- Use mermaid code blocks in your response for diagrams. The UI renders these as interactive SVGs.
- Example: ```mermaid\nflowchart LR\n  A --> B\n```
```

### Auto-Title Generation
- After the first assistant response, backend makes a cheap LLM call (`azure/gpt-4o`) to generate a 4–6 word title from the first user message + response.
- Title is editable by the user.

---

## Out of Scope (for now)

- Mobile / responsive design (desktop-first, 1200px+ minimum)
- Real-time collaboration / multi-user in same conversation
- Custom Docker images for sandboxes (uses template system instead)
- Billing / payment integration (usage tracking exists, but no payment gate)
- Self-hosted Daytona (uses Daytona cloud)
- Visual workflow builder for agent personas (prompt-only for now)
- RAG / document indexing (files are per-sandbox, not a persistent knowledge base)
- AI image generation (DALL-E / Stable Diffusion — could add as a tool later)
- Shareable conversation links (public read-only viewer)
- Side-by-side model comparison mode
