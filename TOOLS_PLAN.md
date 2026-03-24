# New Agentic Tools — Implementation Plan

## 1. `call_api` — HTTP requests without sandbox

**Backend:** `backend/services/web.py` (new)
- httpx async client, configurable timeout (default 15s)
- Methods: GET, POST, PUT, DELETE, PATCH
- Params: `url`, `method`, `headers`, `body`, `auth_type` (none/bearer/basic), `auth_value`
- SSRF protection: block private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, ::1)
- Response: status_code, response_headers (content-type, content-length), body (truncated 8000 chars), duration_ms
- Parse JSON responses automatically, return formatted

**Tool definition:** `backend/prompts/tools.py`
```json
{
  "name": "call_api",
  "description": "Make an HTTP request to an external API. Use this for fetching data from APIs, webhooks, etc. No sandbox needed.",
  "parameters": {
    "url": "string (required)",
    "method": "string enum [GET, POST, PUT, DELETE, PATCH], default GET",
    "headers": "object (optional) — key-value pairs",
    "body": "string (optional) — request body, JSON string for POST/PUT",
    "auth_type": "string enum [none, bearer, basic], default none",
    "auth_value": "string (optional) — token for bearer, base64 for basic"
  }
}
```

**Agent handler:** in `agent.py`, call `web.call_api(...)`, yield tool_output with response.

---

## 2. `web_browse` — Fetch & extract readable content from URL

**Backend:** Same `backend/services/web.py`
- Dependency: `trafilatura` (pip, ~2MB)
- Fetch page with httpx (follow redirects, browser-like UA, timeout 10s)
- **Sanitize:** Strip scripts, event handlers before extraction. trafilatura does this inherently.
- Extract with trafilatura: returns clean text, title, author, date
- Truncate to ~4000 chars (configurable) to fit LLM context
- Fallback: if trafilatura fails, basic HTML tag stripping via regex

**Tool definition:**
```json
{
  "name": "web_browse",
  "description": "Fetch and read the content of a webpage. Returns extracted text, title, and metadata. Use this to read articles, documentation, or any web page.",
  "parameters": {
    "url": "string (required)",
    "extract_links": "boolean (optional, default false) — also return links found on the page"
  }
}
```

**Returns:** title, author, date, main_text (truncated), url, word_count, links (if requested)

---

## 3. `create_chart` — Interactive Vega-Lite charts

**Frontend dependency:** `vega-embed` (npm) — includes vega + vega-lite runtime (~300KB gzipped)

**Backend tool definition:**
```json
{
  "name": "create_chart",
  "description": "Create an interactive chart. Provide a Vega-Lite specification. The chart will be rendered interactively in the user's browser with tooltips, zoom, and pan. Prefer this over matplotlib for any chart that benefits from interactivity.",
  "parameters": {
    "spec": "object (required) — complete Vega-Lite JSON specification including data",
    "title": "string (optional) — chart title for the artifact card"
  }
}
```

**Agent handler:**
- Validate spec is valid JSON with required Vega-Lite fields ($schema, mark or layer)
- Yield SSE event `chart_output` with the spec
- Save as artifact type "interactive_chart"

**Frontend:**
- New component `VegaChart.tsx` — lazy-loads `vega-embed`, renders spec into a container
- Dark theme: inject `config.background: '#121214'`, axis/text colors to match Nexus theme
- Artifact card: renders the chart inline, with "Download PNG", "Download SVG", "View fullscreen" buttons
- `vega-embed` provides export to PNG/SVG built-in via its action menu

**SSE event:** `chart_output` with `{spec: {...}, title: "..."}`
**Streaming state:** Add `charts` array to StreamingState

**System prompt addition:**
```
## Interactive Charts
- Use the create_chart tool for interactive visualizations instead of matplotlib
- Provide complete Vega-Lite specs with inline data
- Dark theme will be applied automatically
- Charts support: tooltips, zoom, pan, selection
- Supported mark types: bar, line, area, point, rect, arc, boxplot, etc.
```

---

## 4. `run_sql` — DuckDB queries on data files

**Sandbox dependency:** `duckdb` (pip install in sandbox creation)

**Tool definition:**
```json
{
  "name": "run_sql",
  "description": "Run a SQL query on data files using DuckDB. CSV, Excel, Parquet files in the sandbox are auto-registered as tables. Use this for fast aggregations, joins, and analysis on large datasets.",
  "parameters": {
    "sql": "string (required) — SQL query to execute",
    "output_format": "string enum [table, csv, json], default table"
  }
}
```

**Agent handler:**
- Generate a Python script that:
  1. Imports duckdb
  2. Auto-discovers CSV/Excel/Parquet files in `/home/daytona/` and registers as tables (filename without extension = table name)
  3. Runs the SQL query
  4. Formats output as markdown table (default), CSV, or JSON
  5. Prints schema info if query fails (list available tables + columns)
- Execute via existing `execute_code` sandbox mechanism
- Parse output, detect tables for artifact extraction

**System prompt addition:**
```
## SQL Queries
- Use run_sql for fast data analysis — DuckDB supports full SQL including window functions, CTEs, aggregations
- Files in the sandbox are auto-registered as tables (e.g., sales.csv → "sales" table)
- Supports: CSV, Excel (.xlsx), Parquet files
- Use run_sql instead of pandas for: aggregations, GROUP BY, joins, filtering large datasets
- Output formats: table (markdown), csv, json
```

---

## 5. `create_ui` — Interactive forms/questionnaires (DEFERRED)

Needs more discussion on:
- Component library: render from JSON schema or allow HTML/React?
- Response flow: how do form submissions get back to the AI?
- Scope: forms only, or also interactive dashboards/calculators?
- Security: sandboxed rendering or inline?

Will design separately after tools 1-4 ship.

---

## Implementation order

1. `call_api` + `web_browse` — same service file, quick to add
2. `create_chart` — needs frontend Vega-Lite integration
3. `run_sql` — sandbox-side, straightforward
4. `create_ui` — designed separately

## Dependencies to add

- **Backend:** `trafilatura` (pip)
- **Sandbox:** `duckdb` (pip, in sandbox creation)
- **Frontend:** `vega-embed` (npm)
