# Epic E1 — step-by-step action plan

**Epic:** [E1 — Identity, layout, and i18n foundation](./roadmap.md#e1--identity-layout-and-i18n-foundation)  
**Grill record:** [E1 foundation grill (2026-04-21)](./grill-session.md#e1-foundation-grill-2026-04-21) and [E1 interactive grill (user session)](./grill-session.md#e1-interactive-grill--user-session-resolved).

Execute in order unless a step explicitly allows parallel work. Check off each step in your issue tracker or PR description.

---

## 0. Resolved product choices (interactive grill)

These are **locked for E1** unless the team explicitly reopens them:

| Topic | Choice |
|--------|--------|
| Workspace | **`app/` only** for E1 — API types + client codegen **inside the app tree**; no `packages/api-schema` requirement for E1. |
| OpenAPI sync | **`pnpm openapi:sync`** uses **vendored `docs/openapi.json` only** (copy/read + generate); **no default network fetch**. |
| Dev API | **Document both**: **Vite proxy** (recommended, empty `VITE_API_BASE_URL`) **and** cross-origin base URL with cookie caveats. |
| Login layout | **Tabs / segmented**: OAuth path and **email OTP** with **equal prominence**. |
| `return_to` | **Query string on `/auth/login` only** — no `sessionStorage` backup for return path. |
| i18n | **Persist** resolved locale + **QA override** (`?lang=en|de` and/or documented dev flag). |
| `/me` caching | **`staleTime` ~15 min** (tune in code), **refetch on window focus**, **refetch after login**. |
| Offline logout | **Wipe local** + **queue server logout** when online (minimal retry). |
| Tests | **Vitest** for **pure helpers** only (allowlist, locale). |
| Unknown routes | **Unauth → `/login`**; **auth → simple not-found** message. |

---

## 1. Monorepo and app skeleton

1. Initialize **pnpm** at the repo root with **workspaces** (`app/` as the Vite SPA). **Defer `packages/chordlib-wasm` / `packages/api-schema`** until a later epic unless already present — E1 keeps generated API artifacts **under `app/`** ([grill I1](./grill-session.md#e1-interactive-grill--user-session-resolved)).
2. Scaffold **`app/`**: Vite, **React 19**, **TypeScript strict**, `@/*` paths if desired.
3. Add root scripts: `dev`, `build`, `lint`, `typecheck` (wire **ESLint** + **Prettier** to team standards).
4. Confirm **`VITE_API_BASE_URL`** reads from env with default **`''`** (same-origin production).
5. **Dev server topology ([grill I3](./grill-session.md#e1-interactive-grill--user-session-resolved)):**
   - Add **`vite.config`** **proxy** rules for **`/api`** and **`/auth`** to your backend origin (configurable via env), and document **recommended local env** (`VITE_API_BASE_URL=` empty + proxy).
   - In **`docs/` or app README**, document **alternate** setup: set **`VITE_API_BASE_URL`** to the API origin and note **cookie / SameSite / CORS** requirements for session cookies.

---

## 2. Styling and branding (blocking for E1 exit)

1. Add **Tailwind v4** and integrate **shadcn/ui** baseline (Radix primitives, copy-in components).
2. Create **`app/src/styles/tokens.css`** with semantic variables from [branding.md](./branding.md) (light + dark using **system** default via `prefers-color-scheme` until E4 Settings).
3. Self-host **Rubik** **WOFF2** under `app/public/fonts/` and **`fonts.css`** — **no** Google Fonts CDN ([branding.md](./branding.md)).
4. Export **PWA icon sizes** (192, 512, **maskable**) and **favicon** from `resources/` into `app/public/brand/` (and favicon path).
5. Complete [branding.md](./branding.md) **intake checklist** (all rows checked) before declaring E1 done.

---

## 3. Routing and app structure

1. Install and configure **TanStack Router** (file-based routes under `app/src/routes/` or equivalent).
2. Define routes for E1 only:
   - **`/login`** — public.
   - **`/`** — **protected** stub (placeholder content); **do not** redirect to `/collections` until E2 ([pages-and-flows.md](./pages-and-flows.md)).
3. **Unknown paths ([grill I10](./grill-session.md#e1-interactive-grill--user-session-resolved)):** Register a **catch-all** route:
   - If **no session** (or before `/me` proves auth): **send user to `/login`** (preserving `return_to` for after login only if you allow deep-linking to unknown routes — otherwise keep it simple and drop).
   - If **authenticated:** show a **minimal branded** “page not found” / stub message (link back to `/` and **Logout**).
4. Add a **root layout** with **outlet** and a **route-level error boundary** (or React error boundary at shell root).
5. Implement **auth gate** per [pages-and-flows.md](./pages-and-flows.md): on load, if session unknown, call **`GET /api/v1/users/me`**; **401** → `/login` + full local cleanup (step 6).

---

## 4. OpenAPI codegen and API client

1. Treat **`docs/openapi.json`** as the **canonical vendored spec** in git.
2. Implement **`pnpm openapi:sync`** ([grill I2](./grill-session.md#e1-interactive-grill--user-session-resolved)): **read/copy** from `docs/openapi.json` into the path your generator expects (if needed), run **openapi-typescript** → e.g. **`app/src/api/schema.d.ts`**, then ensure **`openapi-fetch`** is wired. **Do not** require network in this script by default.
3. Document: **updating the spec** = refresh `docs/openapi.json` (manual download from production docs URL or backend PR) **then** run `openapi:sync`. Optional later: a **separate** `openapi:fetch` script if you want an explicit fetch step — not part of default sync.
4. Export a **single typed client** instance: `baseUrl` from `import.meta.env.VITE_API_BASE_URL`, **`credentials: 'include'`**.
5. Document in README or `app/` README: **frontend owns regen** when the API bumps; run codegen in the same PR as spec updates when possible.

---

## 5. TanStack Query and session hydration

1. Wrap the app in **QueryClientProvider** with sensible defaults.
2. Add a **`useSession`** (or equivalent) for **`GET /api/v1/users/me`** ([api-integration.md](./api-integration.md)) with this **cache policy** ([grill I7](./grill-session.md#e1-interactive-grill--user-session-resolved)):
   - **`staleTime`**: **~15 minutes** (single documented constant; adjust only with team agreement).
   - **`refetchOnWindowFocus`**: **on** (or equivalent focus-based refetch).
   - **After successful login (OAuth or OTP):** **invalidate** or **refetch** the `/me` query immediately — do **not** rely only on focus.
   - **Do not** refetch `/me` on **every** protected route navigation in E1.
3. Wire **401** from the client: **redirect to `/login`**, **clear Query cache**, invoke **Dexie wipe** (step 6).

---

## 6. Local storage cleanup (Query + Dexie)

1. Add **Dexie** with a **versioned**, initially **empty** (or minimal placeholder) schema so the DB exists and can be wiped.
2. Implement **`clearAllLocalData()`**: **clear TanStack Query cache** + **delete or reset Dexie** (same behavior as full logout offline path later).
3. Call **`clearAllLocalData()`** on: **logout**, **401** from protected routes, and whenever auth is invalidated ([api-integration.md](./api-integration.md)).

---

## 7. Auth flows

1. **Login screen structure ([grill I4](./grill-session.md#e1-interactive-grill--user-session-resolved)):** **Tabs** or a **segmented control** with two modes — e.g. **OAuth / provider** vs **email OTP** — **equal visual weight**, both fully i18n’d.
2. **OAuth:** Control navigates to **`GET /auth/login?return_to=...`** (full-page redirect). Build **`return_to`** from the **intended post-login path + query**, **allowlisted** to **same-origin app paths** only ([pages-and-flows.md](./pages-and-flows.md)).
3. **`return_to` transport ([grill I5](./grill-session.md#e1-interactive-grill--user-session-resolved)):** Rely on **query parameters** and server callback behavior **only** — **do not** add a `sessionStorage` mirror for the return path in E1.
4. **OTP:** Forms for **`POST /auth/otp/request`** and **`POST /auth/otp/verify`**; on success, **refetch `/users/me`** (step 5) and navigate to **`return_to`** (from query if present) **or** `/`.
5. **Logout:** **Online:** `POST /auth/logout` then **`clearAllLocalData()`**. **Offline / flaky:** **`clearAllLocalData()`** immediately; **enqueue** `POST /auth/logout` when the browser is online again with **minimal retry** ([grill I8](./grill-session.md#e1-interactive-grill--user-session-resolved)) — no need for the full E4 mutation outbox unless you choose to share one implementation.
6. **OTP errors:** Show API **`Problem`** message **inline**; generic fallback if body empty ([grill-session.md](./grill-session.md) interactive grill).

---

## 8. i18n (English + German)

1. Add **i18next** + React bindings; load **`en`** and **`de`** resources for **all user-visible strings** in E1 (login, errors, stub page, buttons).
2. **Locale resolution:** Map **`navigator.languages`** to **`en` | `de`** with fallback **`en`** ([pages-and-flows.md](./pages-and-flows.md), [tech-stack.md](./tech-stack.md)).
3. **Persistence ([grill I6](./grill-session.md#e1-interactive-grill--user-session-resolved)):** Persist the **active locale** (and any **“use browser default”** flag your E4 design needs) using **the same storage keys** Zustand/i18next will use when **Settings** ships — avoid one-off keys that require migration.
4. **QA / dev override:** Support **`?lang=en`** and **`?lang=de`** (apply once on load, document in README) and/or a **documented** `localStorage` override for testers who cannot change OS language. Optionally gate **non-production**-only if you prefer not to ship query overrides in prod (team choice — if gated, document the env flag).
5. Verify **German product name** stays **“Worship Viewer”** per [branding.md](./branding.md).

---

## 9. Minimal shell UI

1. Build a **minimal** authenticated layout: optional top bar (brand/mark), **profile or logout** affordance, **outlet** for the stub page — **no** library **bottom nav**, **no** Cmd-K, **no** hub search ([E1 foundation grill](./grill-session.md#e1-foundation-grill-2026-04-21)).
2. **Stub page** at `/`: proves session (e.g. show user id/email if API exposes it) and links or button **Logout** only — copy can note “library lists ship in E2” if helpful internally.

---

## 10. Unit tests (Vitest, utilities only)

1. Add **Vitest** (or team-standard unit runner) to **`app/`** or repo root per your layout ([grill I9](./grill-session.md#e1-interactive-grill--user-session-resolved)).
2. Cover **pure functions** with no browser mocks required, for example:
   - **`return_to` / path allowlist** — rejects other origins, rejects `//`, only allows app-internal paths + query.
   - **Locale resolution** — `navigator.languages`-style inputs map to **`en` | `de`** + **override** rules for `?lang=`.
3. **Do not** require MSW, Playwright, or service-worker tests for E1 exit.

---

## 11. Exit verification (manual)

1. **Cold load:** unauthenticated → **`/login`**; authenticated cookie → **`/`** stub without hitting hub routes.
2. **Login tabs:** switch between **OAuth** and **OTP** modes; both layouts usable on narrow and wide viewports.
3. **OAuth** (or dev-equivalent) and **OTP** paths both reach authenticated state and **`/users/me`** matches; **`/me`** does **not** refetch on every client-side navigation (spot-check React Query Devtools or network panel).
4. **`return_to`:** deep link with allowlisted path + query while logged out → after login, land on that path (same origin only); confirm **no** dependency on `sessionStorage` for return path.
5. **Logout:** session cleared, no stale Query data; Dexie DB cleared or empty after wipe.
6. **401 simulation:** local cleanup matches logout.
7. **i18n:** change browser language **and** exercise **`?lang=`** override; confirm **de** vs **en** and that **persisted** locale survives reload (when applicable).
8. **Offline logout (optional smoke):** go offline, logout — local cleared; back online — observe **logout POST** attempted (network tab).
9. **Unknown URL:** logged out → **`/login`**; logged in → **simple not-found** UI ([grill I10](./grill-session.md#e1-interactive-grill--user-session-resolved)).
10. **Dev topology:** run once with **proxy** (empty base URL) and once with **cross-origin** base URL if supported — document any friction.
11. **Branding:** no placeholder-only tokens; fonts/icons/favicon match [branding.md](./branding.md) checklist.

When all steps pass, **E1 is complete** — proceed to [E2](./roadmap.md#e2--three-hub-lists-collections-songs-setlists) (three hub lists and `/` → `/collections`).

---

## Related docs

- [Roadmap](./roadmap.md)
- [API integration](./api-integration.md)
- [Pages and flows](./pages-and-flows.md)
- [Tech stack](./tech-stack.md)
- [Branding](./branding.md)
- [Design grill session](./grill-session.md)
