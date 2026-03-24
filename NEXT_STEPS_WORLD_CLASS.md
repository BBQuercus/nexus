# Nexus Next Steps

## Purpose

This document turns the current audit into an execution plan for taking Nexus from a strong prototype/product to a world-class application.

The work is split into two tracks:

- A. Operational reliability: everything required to make the app consistently safe, testable, observable, maintainable, and releaseable.
- B. Differentiation: product and UX improvements that make Nexus meaningfully better than generic AI chat products.

The order below is intentional. Reliability work should start immediately and run in parallel with selective feature work, but the first shipping priority is to make the system trustworthy.

---

## A. Operational Reliability

### A1. Establish a Real Quality Gate

#### Why

The codebase already has useful backend tests, but it does not yet have a dependable release gate. A world-class product needs a clear answer to: "what proves this build is safe to ship?"

#### Next steps

1. Add explicit test tooling to the Python project.
   - Add `pytest`, `pytest-asyncio`, and coverage tooling to the project config.
   - Ensure a fresh developer environment can run backend tests without guessing missing packages.

2. Add frontend test infrastructure.
   - Add unit/component tests for critical UI pieces:
     - message rendering
     - streaming state transitions
     - artifact panels
     - conversation tree behaviors
     - auth/session flows
   - Add browser-level tests for core user journeys:
     - login
     - create conversation
     - send prompt
     - stream response
     - tool execution
     - sandbox creation
     - artifact generation
     - branching/regeneration

3. Define release-blocking scenarios.
   - Required passing suites before merge:
     - backend unit/integration tests
     - frontend component tests
     - end-to-end smoke tests
     - lint/type checks
   - Required passing suites before production deploy:
     - all of the above
     - migration validation
     - sandbox integration smoke test
     - LLM proxy connectivity smoke test

4. Add deterministic fixtures for agent runs.
   - Record representative tool-heavy interactions.
   - Snapshot expected event sequences and artifacts.
   - Use them to catch regressions in streaming, tool orchestration, and message shaping.

#### Definition of done

- `make test` or equivalent runs all critical checks.
- CI blocks merges on failures.
- There is a small, stable suite that validates the entire happy path end to end.

---

### A2. Refactor the Highest-Risk Architectural Hotspots

#### Why

Nexus has a strong product thesis, but too much critical behavior is concentrated in a few large modules. That makes change expensive and regressions likely.

#### Backend refactors

1. Break up `backend/services/agent.py`.
   - Extract:
     - conversation history builder
     - tool call executor
     - retrieval orchestration
     - artifact collector
     - streaming event mapper
     - usage accounting
   - Keep one thin top-level runtime coordinator.

2. Create explicit tool contracts.
   - Standardize tool input validation, output schema, logging, and error classification.
   - Ensure every tool has:
     - typed input
     - typed result
     - timeout behavior
     - retry policy
     - redaction rules

3. Separate runtime boot from schema management.
   - Remove schema mutation logic from app startup.
   - Use Alembic migrations only for schema changes.
   - Make startup fail clearly if schema is incompatible.

4. Introduce a service boundary for sandbox execution.
   - Separate:
     - sandbox lifecycle
     - command execution
     - filesystem access
     - artifact discovery
     - terminal streaming
   - This makes it easier to test and easier to swap providers later if needed.

#### Frontend refactors

1. Split the global Zustand store into focused slices.
   - Suggested slices:
     - session/auth
     - conversation data
     - composer/input
     - streaming/execution
     - workspace chrome/layout
     - artifacts/preview

2. Reduce logic concentration in `workspace.tsx`.
   - Extract:
     - keyboard shortcut manager
     - drag-and-drop manager
     - focus mode manager
     - shell layout controller

3. Formalize API state handling.
   - Standardize request states, optimistic updates, retries, and error surfaces.
   - Prevent each component from reinventing its own loading/error lifecycle.

#### Definition of done

- No single file remains the only place that understands the full system.
- Critical flows can be tested through small modules as well as end-to-end.
- Onboarding a new engineer no longer requires reading giant "god files" first.

---

### A3. Build Production-Grade Observability

#### Why

For agent systems, plain API logs are not enough. You need to understand what the model did, what tools it touched, why a run failed, and how often users experience degraded output.

#### Next steps

1. Add run-level tracing.
   - Every agent run should have a trace/span tree with:
     - conversation ID
     - user ID
     - model
     - mode/persona
     - tool call sequence
     - retrieval invocations
     - sandbox lifecycle
     - timing and token usage

2. Add a structured event taxonomy.
   - Standard event names for:
     - stream started/completed/aborted
     - tool call started/succeeded/failed
     - sandbox create/start/stop/delete
     - retrieval hit/miss
     - artifact emitted
     - user-visible error categories

3. Instrument user-facing quality metrics.
   - Time to first token
   - Time to final answer
   - Tool success rate
   - Sandbox creation success rate
   - Retrieval usage and usefulness
   - Run abort rate
   - Frontend crash rate
   - Session refresh failures

4. Add operational dashboards and alerts.
   - Alerts for:
     - spike in 5xx responses
     - degraded LLM proxy health
     - sandbox failures
     - long-tail latency
     - repeated streaming disconnects
     - database connectivity issues

5. Add frontend error reporting with release tagging.
   - Capture release version, route, active conversation ID, browser details, and major UI state context.

#### Definition of done

- Any major failure can be traced from user action to backend/tool/sandbox event.
- The team can answer "what broke?" and "how often?" quickly.

---

### A4. Strengthen Reliability at Runtime Boundaries

#### Why

AI products often fail at integration edges: model proxies, browsers, websockets, SSE, file uploads, background jobs, and third-party services.

#### Next steps

1. Define timeout and retry policies by dependency class.
   - LLM proxy
   - web search
   - external APIs
   - sandbox provider
   - storage
   - database

2. Introduce circuit-breaker or fail-open/fail-closed rules where appropriate.
   - Example:
     - if retrieval is down, answer without it and surface degraded state
     - if sandbox is down, disable execution affordances instead of producing partial broken behavior

3. Harden streaming behavior.
   - Resume/reconnect strategy where possible
   - explicit cancellation propagation
   - orphaned stream cleanup
   - stronger client-side handling for partial event streams

4. Add background cleanup jobs.
   - stale sandbox cleanup
   - orphaned artifact cleanup
   - expired upload cleanup
   - telemetry compaction/retention jobs if needed

5. Add defensive limits.
   - max tool iterations
   - max artifact size
   - max upload size
   - max generated chart/table payload
   - rate limits by user and endpoint class

#### Definition of done

- External dependency failures degrade gracefully instead of causing confusing UI states.
- Long-running sessions do not accumulate leaked resources.

---

### A5. Improve Release Engineering

#### Why

World-class apps have boring deploys. Boring deploys require explicit release mechanics.

#### Next steps

1. Standardize environments.
   - local
   - preview/staging
   - production
   - Each should have clearly defined config and parity expectations.

2. Add CI/CD with progressive checks.
   - On PR:
     - lint
     - typecheck
     - tests
     - build
   - On deploy:
     - migration check
     - health verification
     - post-deploy smoke test

3. Add release versioning and changelog discipline.
   - Tag backend and frontend builds.
   - Ensure logs and frontend errors carry release IDs.

4. Add rollback readiness.
   - Production deploy should support:
     - application rollback
     - migration safety check
     - feature-flag disablement

5. Introduce feature flags for risky capabilities.
   - multi-agent branching
   - sandbox execution
   - new retrieval modes
   - experimental UI panels

#### Definition of done

- A production incident does not require ad hoc SSH heroics.
- The team can deploy, verify, and roll back safely.

---

### A6. Security and Compliance Hardening

#### Why

A sandboxed AI workspace will attract higher scrutiny than a plain chat app because it handles code, files, external calls, and generated artifacts.

#### Next steps

1. Perform a threat-model pass on:
   - auth/session handling
   - file uploads
   - sandbox escape paths
   - SSRF through API/web tools
   - prompt injection via uploaded/retrieved content
   - artifact serving and path traversal

2. Tighten auditability.
   - record who did what, when, with which tools and outputs
   - add admin-visible audit trails for sensitive actions

3. Add dependency and secret hygiene.
   - dependency scanning
   - secret scanning
   - pin or constrain critical runtime dependencies

4. Add explicit redaction policy.
   - secrets
   - auth headers
   - uploaded private data
   - retrieved enterprise content

5. Validate sandbox isolation assumptions.
   - filesystem boundaries
   - network boundaries
   - process limits
   - cleanup guarantees

#### Definition of done

- Security posture is documented, tested, and not based on assumptions hidden in vendor docs.

---

## B. Differentiation and Standout Features

### B1. Make the Agent’s Work Legible

#### Why

Most AI tools still feel magical in the bad sense: users cannot tell what happened. Nexus can win by making execution transparent without overwhelming the user.

#### Next steps

1. Add a first-class execution timeline.
   - Show:
     - reasoning summary
     - retrieval steps
     - tool calls
     - sandbox commands
     - generated files
     - final outputs

2. Improve provenance UI.
   - Distinguish clearly between:
     - model answer
     - cited source
     - retrieved context
     - computed artifact
     - sandbox-generated file

3. Add reversible actions.
   - rerun from step
   - branch from tool result
   - fork from message
   - compare two runs side by side

4. Add post-run summaries.
   - "What I did"
   - "What I changed"
   - "What to review"
   - "What I’m uncertain about"

---

### B2. Turn Artifacts into a Core Product Surface

#### Why

The artifact model is one of Nexus's strongest advantages. Most AI chat apps still treat outputs as text blobs.

#### Next steps

1. Create a unified artifact center.
   - charts
   - tables
   - code files
   - reports
   - generated media
   - downloadable bundles

2. Add artifact lineage.
   - show which prompt, tool call, dataset, or file produced each artifact

3. Support live artifact updates.
   - when the agent iterates, the artifact should update in place with version history

4. Add richer viewers.
   - notebook-like data view
   - file diff view
   - chart editing/variant generation
   - side-by-side before/after comparison

5. Add export workflows.
   - shareable report
   - downloadable project bundle
   - reusable notebook/script

---

### B3. Deepen the Workspace Concept

#### Why

The strongest strategic direction is not "better chat." It is "AI-native workspace for real work."

#### Next steps

1. Add reusable workspaces/projects.
   - persistent context, files, tools, and preferred models

2. Add task-oriented layouts.
   - coding mode
   - research mode
   - data analysis mode
   - document mode

3. Add session memory controls.
   - what context is attached
   - what is pinned
   - what is project memory vs conversation memory

4. Add durable task objects.
   - a run should be promotable into a task with status, outputs, and follow-up actions

5. Add better collaboration primitives later.
   - shared workspaces
   - reviewer mode
   - comments on artifacts
   - approvals for external actions

---

### B4. Be Best-in-Class for Coding and Data Work

#### Why

Sandboxed execution plus artifacts is a major advantage if the app becomes excellent at coding and analysis workflows.

#### Next steps

1. Improve code execution ergonomics.
   - visible file tree diffs
   - command history
   - rerun last command
   - save checkpoints

2. Add data workflow affordances.
   - dataset schema preview
   - automatic profiling
   - chart suggestions
   - table transforms
   - notebook-style replay of analysis steps

3. Add stronger language-specific workflows.
   - Python project scaffold
   - web app scaffold
   - SQL exploration mode
   - test generation and fix loop

4. Add "inspect before apply" for generated code and file edits.
   - proposed changes
   - risk classification
   - tests to run
   - revert controls

---

### B5. Make Multi-Path Exploration a Signature Feature

#### Why

Branching and comparison can be a genuine product advantage if executed cleanly.

#### Next steps

1. Upgrade conversation branching into run branching.
   - users should be able to branch from:
     - a prompt
     - a tool call
     - a retrieval strategy
     - a chosen model

2. Add compare mode.
   - compare two model outputs
   - compare two tool strategies
   - compare two artifact versions

3. Add explicit "best of N" workflows.
   - generate multiple approaches
   - score them on defined criteria
   - let user adopt one or merge ideas

4. Add explainable differences.
   - summarize how branch A differs from branch B in conclusions, files, artifacts, and sources

---

### B6. Raise the UX Bar Further

#### Why

The current app already looks more coherent than many competitors. The next leap is not more polish for its own sake, but greater clarity and confidence.

#### Next steps

1. Simplify the first-run mental model.
   - communicate what Nexus is in one sentence
   - make the first successful action extremely obvious

2. Improve empty and loading states.
   - make them instructional, not decorative
   - tailor them by workflow type

3. Make system state obvious.
   - sandbox running/stopped/degraded
   - retrieval available/unavailable
   - model/provider status
   - long-running task progress

4. Improve keyboard-first usage.
   - stronger command palette
   - action search
   - context-sensitive shortcuts
   - power-user navigation for branches, artifacts, and files

5. Add confidence and uncertainty signaling.
   - not generic disclaimers
   - clear markers for inferred results, weak retrieval, failed tools, and partial outputs

---

## Suggested Execution Order

### Phase 1: Stabilize the Base

- Add test tooling and CI gates
- Remove schema mutation from startup
- Add core observability
- Refactor the largest runtime/store hotspots

### Phase 2: Make Reliability Visible

- Improve degraded-mode handling
- Add dashboards and alerts
- Harden streaming and sandbox lifecycle cleanup
- Add explicit release and rollback process

### Phase 3: Ship Signature Product Improvements

- Execution timeline
- artifact lineage and richer viewers
- compare/branch workflows
- stronger coding and data-analysis flows

### Phase 4: Expand Into a True AI Workspace

- reusable projects/workspaces
- durable tasks
- collaboration/review flows
- advanced memory and context controls

---

## 30/60/90 Day Cut

### Next 30 days

- Add backend/frontend test runners
- Add CI checks
- Introduce release IDs and basic error reporting
- Move DB schema changes fully into migrations
- Start extracting modules from the backend agent runtime
- Start splitting the frontend store into slices

### Next 60 days

- Add end-to-end smoke tests
- Add tracing and dashboards
- Harden sandbox and streaming failure handling
- Ship first execution timeline
- Ship clearer provenance/source/artifact UI

### Next 90 days

- Add artifact lineage and richer viewers
- Add compare mode for branches/runs
- Add project/workspace persistence model
- Add risk-reviewed apply flows for generated code and files

---

## Guiding Principle

Nexus should not try to win by becoming a bigger generic AI app.

It should win by becoming the most trustworthy and legible environment for doing real work with AI:

- better operational reliability than AI prototypes
- better workflow depth than generic chat apps
- better execution transparency than black-box agents
- better artifacts than text-only assistants

That is the path from "pretty decent tool" to "world class."
