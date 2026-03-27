# Backend Cleanup Checklist

Generated from static analysis (radon + ruff) on 2026-03-27.

---

## Critical

- [ ] **Fix `HTTPException` undefined name in `main.py:559`** — actual crash bug; `get_bug_screenshot` will raise `NameError` at runtime
- [ ] **Split `routers/chat.py`** (1,239 lines, MI=7.87/100 — only C-grade file in codebase) into:
  - `routers/conversations.py` — CRUD (create, list, get, update, delete, bulk delete)
  - `routers/messages.py` — send message + SSE streaming handler
  - `routers/images.py` — image generation endpoint
  - `routers/artifacts.py` — artifact CRUD
- [ ] **Decompose `services/agent/runner.py::run_agent_loop`** (CC=F/43) — extract into named helpers:
  - knowledge base injection
  - streaming loop
  - tool execution loop
  - error recovery / retry logic
- [ ] **Refactor `services/agent/tool_executor.py::execute_tool_call`** (CC=D/28) — replace if-elif dispatch with a `dict[str, Callable]` tool registry so adding tools doesn't require editing this function

---

## High

- [ ] **Decompose `auth.py::get_current_org`** (CC=C/20, 57 statements) — separate WorkOS user sync, org resolution, role checking, and CSRF into distinct helpers
- [ ] **Move WebSocket terminal handler** (`main.py::sandbox_terminal`, CC=C/15) into `routers/sandboxes.py` or `routers/terminal.py`
- [ ] **Break up `main.py`** (822 lines) — health/readiness checks, bug reporting, model listing, and metrics endpoints should move to dedicated router files; `main.py` should only configure the app
- [ ] **Simplify `services/agent/history.py::build_llm_messages`** (CC=D/24) — too many special cases for multimodal content, tool results, and knowledge base injection inline
- [ ] **Resolve deferred/function-level imports** (`PLC0415`, ~30 instances across `auth.py`, `main.py`, `cache.py`, `middleware.py`) — symptom of circular dependencies; restructure to break the cycles properly

---

## Medium

- [ ] **Audit all `except Exception` blind catches** (`BLE001`, ~25 instances) — narrow to specific exception types or re-raise; none should silently swallow
- [ ] **Fix `except Exception: pass` silencers** — `middleware.py:97` and `auth.py:601` drop exceptions entirely with no log
- [ ] **Replace `log.error()` with `log.exception()`** where inside an except block (`TRY400`, ~6 instances) — currently losing tracebacks in production logs
- [ ] **`_check_llm` in `main.py`** (CC=D/23, 18 branches) — extract per-provider check logic into separate functions
- [ ] **`prompts/system.py::build_system_prompt`** (CC=C/20) — conditionals for each injected section should be extracted into composable builder functions
- [ ] **`routers/search.py::search`** (CC=C/18, 144-line file) — FTS + ILIKE fallback + snippet extraction + filtering is too much for one function; split query-building from result-formatting
- [ ] **`services/llm.py::stream_chat`** (CC=C/17) — streaming, retry, tool call handling, and fallback logic mixed together; extract retry/fallback wrapper
- [ ] **Migrate FastAPI dependencies from `Depends()` defaults to `Annotated[..., Depends()]`** (`FAST002`/`B008`, ~20 instances) — current style is deprecated in newer FastAPI

---

## Low

- [ ] **Replace magic HTTP status literals** in `main.py` — `200`, `300`, `500` used bare in comparisons; use `http.HTTPStatus` or named constants
- [ ] **Remove unused `user_id` argument** in `main.py::list_models` (`ARG001`) — auth dependency is loaded but never referenced
- [ ] **`services/extraction.py::extract_artifacts`** (CC=C/18) and **`services/artifact_model.py::classify_artifact_type`** (CC=C/18) — classification logic should use a data-driven lookup rather than nested conditionals
- [ ] **Encapsulate dual DB engine selection** — callsites currently manually pick between `db.py` and `vector_db.py` sessions; wrap in a single access layer before the planned consolidation
