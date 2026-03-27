# Internationalization (i18n) Plan — Nexus

## Context

Nexus has ~200+ hardcoded English strings across ~80 frontend components and ~30 backend error messages. We're adding German + English support (extensible to more languages) using cookie/header-based locale detection (no URL prefixes). Backend will return error codes; frontend will handle all translation.

## Library: `next-intl`

Best fit for Next.js 15 App Router. Mature, well-maintained, supports server components, client components, and metadata. No need for `[locale]` route segments when using cookie-based detection.

## Architecture

```
frontend/
├── i18n/
│   ├── request.ts          # next-intl server config (getRequestConfig)
│   ├── config.ts            # Supported locales, default locale
│   └── client.ts            # Client-side helpers (useTranslations re-export)
├── messages/
│   ├── en.json              # English translations (source of truth)
│   └── de.json              # German translations
├── middleware.ts             # Locale detection from Accept-Language / cookie
├── app/
│   └── layout.tsx           # Wrap with NextIntlClientProvider, set html lang
└── components/
    └── language-switcher.tsx # UI toggle for language selection
```

## Implementation Steps

### 1. Install & Configure next-intl

- `npm install next-intl`
- Create `frontend/i18n/config.ts` — export `locales = ['en', 'de']`, `defaultLocale = 'en'`
- Create `frontend/i18n/request.ts` — `getRequestConfig` that reads locale from cookie or Accept-Language header
- Create `frontend/middleware.ts` — detect locale, set cookie if not present
- Update `next.config.ts` — add `createNextIntlPlugin()` wrapper

### 2. Create Translation Files

- `frontend/messages/en.json` — all English strings organized by namespace (page/component)
- `frontend/messages/de.json` — German translations (same structure)

**Namespace structure:**
```json
{
  "common": { "cancel": "Cancel", "confirm": "Confirm", "search": "Search...", ... },
  "login": { "signIn": "Sign In", "createAccount": "Create Account", ... },
  "admin": { "overview": "Overview", "users": "Users", ... },
  "chat": { "newConversation": "New Conversation", ... },
  "agents": { "createAgent": "Create Agent", ... },
  "knowledge": { "documents": "Documents", ... },
  "errors": { "conversationNotFound": "Conversation not found", ... },
  "emptyState": { "greetingMorning1": "Good morning, {name}", ... },
  ...
}
```

### 3. Update Root Layout

- `app/layout.tsx`: Wrap children with `NextIntlClientProvider`, set `<html lang={locale}>`
- Pass messages to provider

### 4. Extract All Frontend Strings

Go through every component and page, replace hardcoded strings with `useTranslations()` (client) or `getTranslations()` (server) calls.

**Key files to modify (all pages + major components):**
- `app/layout.tsx` — metadata, html lang
- `app/login/page.tsx` — ~20 strings
- `app/admin/page.tsx` — ~40 strings
- `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`
- `components/empty-state.tsx` — 48 greeting variants
- `components/sidebar/` — conversation list, actions
- `components/chat-input/` — input placeholders, actions
- `components/message-bubble/` — message actions, tool calls
- `components/agents-view.tsx`, `components/agent-picker.tsx`
- `components/knowledge-base.tsx`, `components/kb-picker.tsx`
- `components/command-palette.tsx`
- `components/user-dropdown.tsx`
- `components/confirm-dialog.tsx` (default labels)
- `components/offline-banner.tsx`, `components/health-banner.tsx`, `components/degraded-banner.tsx`
- `components/bug-report-dialog.tsx`
- `components/model-picker.tsx`
- `components/sandbox-bar.tsx`
- `components/top-bar.tsx`
- `components/install-prompt.tsx`
- `components/context-window-viz.tsx`
- `components/search-panel.tsx`, `components/sources-panel.tsx`
- `components/files-panel.tsx`, `components/tree-panel.tsx`, `components/memory-panel.tsx`
- `components/artifact-center.tsx`, `components/artifacts-panel.tsx`
- `components/form-renderer.tsx`
- `components/diff-viewer.tsx`
- `components/project-switcher.tsx`, `components/create-org-dialog.tsx`
- `components/run-summary.tsx`, `components/run-comparison.tsx`
- `components/preview-panel.tsx`, `components/terminal-panel.tsx`
- `lib/landing-prompts.ts` / `lib/landing-prompts.json` — translatable prompt labels

### 5. Add Language Switcher

- New `components/language-switcher.tsx` — dropdown or toggle in user menu
- Saves preference to cookie (`NEXT_LOCALE`)
- Add to `components/user-dropdown.tsx`

### 6. Backend Error Codes

Update backend error responses to use structured error codes instead of plain strings:

**Current:**
```python
raise HTTPException(status_code=404, detail="Conversation not found")
```

**New:**
```python
raise HTTPException(status_code=404, detail={"code": "conversation_not_found", "message": "Conversation not found"})
```

- `message` stays English as fallback / for API consumers
- Frontend `apiFetch` maps `code` to translated string, falls back to `message`
- Update `lib/api.ts` to handle the new error shape

**Backend files to modify:**
- `backend/routers/chat.py`
- `backend/routers/agents.py`
- `backend/routers/admin.py`
- `backend/routers/knowledge.py`
- `backend/routers/users.py`
- `backend/auth.py`
- `backend/middleware.py` (GlobalExceptionMiddleware)

### 7. Update Tests

- Update frontend tests that assert on string content to use translation keys or translated values
- Add a test that validates en.json and de.json have the same keys (no missing translations)

## Verification

1. `just lint` + `just type-check` — no regressions
2. `just test` — all tests pass
3. Manual: Switch language in UI, verify all pages render correctly in both EN and DE
4. Manual: Trigger backend errors, verify they show translated in the frontend
5. Manual: Refresh page — locale persists via cookie
6. Check: New browser with German `Accept-Language` header defaults to German

## Notes

- German translations can start as machine-translated placeholders, refined later
- The `messages/` JSON structure makes it easy to add more locales later (just add `fr.json`, etc.)
- `next-intl` supports ICU message format for plurals, dates, numbers — use as needed
- No changes to URL structure or routing
