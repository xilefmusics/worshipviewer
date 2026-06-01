# Locale and i18n policy

Supported UI locales: **English (`en`)** and **German (`de`)**. Translation files: `frontend/app/src/i18n/en.json`, `de.json`.

## Resolution order

Implemented in [`locale.ts`](../../frontend/app/src/lib/locale.ts) and [`i18n/index.ts`](../../frontend/app/src/i18n/index.ts):

1. **`?lang=en|de`** query param (QA override; highest priority)
2. **Explicit preference** — `localStorage.i18nextLng` when browser mode is off
3. **Browser languages** — `navigator.languages` mapped to `en` or `de` (default `en`)

## Browser vs explicit locale

| Mode | Storage | Behavior on language change |
|------|---------|----------------------------|
| **Browser** | `wv_use_browser_locale = '1'`; **`i18nextLng` not written** | Follows OS/browser language each session; intentional non-persistence (**action plan 6.9**) |
| **English / Deutsch** | `i18nextLng = 'en'|'de'`; browser flag cleared | Persists across reloads via `languageChanged` handler |

Settings UI: [`SettingsView.tsx`](../../frontend/app/src/components/settings/SettingsView.tsx) → `setLocalePreference`.

## Survives logout

[`clearAllLocalData`](../../frontend/app/src/lib/clear-local.ts) clears TanStack Query and Dexie but **does not remove** locale keys. Users keep language choice after sign-out (**A4**).

## Document language

Static `<html lang="en">` in `index.html` — syncing `lang` on locale switch is user-facing work (**1.9**).

## RTL and logical direction (deferred)

Action plan **6.10**: RTL is **not implemented** and not required for current `en`/`de` scope.

- No `dir` attribute on `<html>` or layout roots.
- Tailwind uses physical **`left`/`right`** utilities, not logical `start`/`end`.
- Adding Arabic/Hebrew would require audit of player columns, AV projection, and hub chrome.

Record limitation in [`../future-epics/gaps.md`](../future-epics/gaps.md) when expanding locale list.

## Related docs

- [`frontend-user-flows.md`](frontend-user-flows.md) § J1 General tab
- [`frontend-error-ux.md`](frontend-error-ux.md) — API errors remain English until **1.11**
