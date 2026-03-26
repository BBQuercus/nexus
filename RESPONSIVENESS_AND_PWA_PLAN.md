# Responsive Small-Screen Upgrade With Selective PWA Support

## Summary
Improve the app in two parallel tracks:

- Rework the workspace into a true chat-first phone experience, with panels demoted to secondary sheets or routes instead of trying to preserve the desktop layout on a narrow viewport.
- Reduce perceived latency and interaction cost on `/` so the mobile UI feels immediate, while keeping PWA scope limited to installability and shell polish rather than offline app behavior.

## Primary Product Constraint
The desktop interface remains the primary use case by a wide margin.

Any mobile or PWA work must preserve desktop quality completely:

- No deterioration in desktop information density, workflow speed, panel availability, or overall usability.
- No desktop-first interactions should be removed, hidden, or simplified just to make the phone layout easier.
- Mobile adaptations should be additive and breakpoint-specific, not a lowest-common-denominator redesign.
- If a tradeoff appears between phone ergonomics and desktop power, desktop behavior wins unless there is an explicit product decision otherwise.

## Current Repo Observations
- The frontend is a Next.js app with an existing `manifest.ts`, but no service worker is currently present.
- The main `/` route is fully client-rendered today and ships a large first-load bundle.
- The workspace eagerly mounts a broad client shell with several overlays and global effects.
- Heavy libraries such as `xterm`, `mermaid`, `vega-embed`, and `shiki` are present and should stay off the critical path whenever possible.
- The message list currently has no virtualization and likely pays increasing render cost on long conversations.
- Some mobile overlay behavior already exists, but the workspace is still structurally desktop-first.

## Key Changes
### 1. Small-screen UX architecture
- Introduce a mobile workspace mode below a defined breakpoint, with a different composition than desktop instead of only CSS compression.
- Make the default phone view: top bar, message list, composer, and current conversation context.
- Move sidebar, terminal, files, artifacts, search, and tree into bottom sheets, drawers, or dedicated secondary views triggered from compact actions.
- Keep only one major panel visible at a time on phone; avoid split panes entirely on narrow screens.
- Audit all fixed heights, `h-dvh` usage, and keyboard/composer behavior so the message list remains usable with the mobile soft keyboard open.
- Preserve the current desktop layout for larger breakpoints; mobile work must not weaken tablet or desktop workflows.

### 2. First-load and route responsiveness
- Stop making the home route fully client-gated if possible; move auth/session bootstrapping and initial user fetch closer to server or render boundaries so the first screen is not blocked on a client effect.
- Split the workspace shell so nonessential overlays and utilities mount lazily: command palette, shortcuts, diff viewer, onboarding tour, and heavy right-panel content.
- Keep expensive libraries (`xterm`, `mermaid`, `vega-embed`, `shiki`) lazy and ensure they do not contribute to the initial chat bundle unless their UI is opened.
- Add route-level loading boundaries where useful so chat UI becomes interactive before auxiliary panels finish preparing.

### 3. Long-session smoothness
- Add message list virtualization or windowing for larger conversations.
- Reduce broad Zustand subscriptions in top-level chat components; prefer narrower selectors so streaming updates do not rerender unrelated UI.
- Avoid reparsing or repainting large markdown trees on every streaming tick; batch or coarsen streaming render updates, especially for long assistant messages.
- Ensure per-message derived state does not repeatedly scan the full message array when conversations are large.

### 4. Selective PWA support
Add:

- Complete manifest polish: proper icons, maskable icons, screenshots if useful, stable theme and background colors.
- Installability checks and minimal UX for "Add to Home Screen" where supported.
- A lightweight service worker only for app shell and static asset caching and safe revisit performance.
- Explicit online-only messaging for actions that require backend or model connectivity.

Do not add:

- Offline chat, offline inference, or queueing prompts for later replay.
- Broad API or runtime caching for authenticated conversation data unless a concrete safe cache policy is designed first.
- Background sync, push, or sync-heavy PWA features in this phase.
- PWA complexity that changes auth correctness or risks stale conversation state.

## Test Plan
- Phone widths: open app, switch conversations, send message, stream response, open and close each secondary panel, upload a file, and recover from keyboard open and close without layout breakage.
- Tablet and desktop widths: verify current split-pane behavior remains intact.
- Desktop regression is a release blocker for this work.
- Long conversations: verify scroll performance, scroll-to-bottom behavior, and no visible regressions in streaming updates.
- Install flow: manifest validity, install prompt behavior where supported, icon quality, standalone launch, and graceful handling when offline.

## Explicit Exclusions
- No offline-first architecture.
- No attempt to make terminal or live model interactions work without network.
- No large-scale design-system rewrite; the change should preserve the existing visual language while restructuring mobile information density.
- No speculative caching of conversation payloads or generated outputs beyond shell and static assets in this phase.
