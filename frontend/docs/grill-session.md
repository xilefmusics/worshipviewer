# Design grill session (question bank)

Structured **pressure-test** questions for Worship Viewer frontend design. Use in human reviews or with Cursor: the project rule `.cursor/rules/grill-session.mdc` attaches when you work under `docs/` so agents can use this file as a checklist.

**How to use:** Answer in batches (e.g. 1–20); reconcile answers with [architecture.md](./architecture.md), [api-integration.md](./api-integration.md), [app-shell.md](./app-shell.md), [pages-and-flows.md](./pages-and-flows.md), [pwa-install.md](./pwa-install.md), [roadmap.md](./roadmap.md), and [tech-stack.md](./tech-stack.md). Promote resolved decisions into those docs or the [decision log](./plan.md#decision-log).

## Recorded answers (grill session)

*Synthesized from interactive Cursor Q&A; normative copies live in [architecture.md](./architecture.md) and [api-integration.md](./api-integration.md).*

### Branding grill (2026-04-20)

| # | Topic | Decision |
|---|--------|----------|
| BR1 | Product name | **Worship Viewer** — canonical; PWA **`short_name`** = **Worship** |
| BR2 | Login tagline | **Headline:** *All for His glory.* **Body:** synthesize from *lead worship → step aside when the Spirit moves*, *focus on the room not the screen*, *don’t make music — worship*; **warm minimal** voice; **worship team** primary persona |
| BR3 | Primary color | **`oklch(0.55 0.21 27)`** canonical; ~**`#d01d21`** hex fallback for non-OKLCH consumers |
| BR4 | Secondary / accent | **Primary + tints only** — no second brand hue |
| BR5 | Default theme | **System** (`prefers-color-scheme`) until user sets **Light / Dark / Use browser default** |
| BR6 | Player chrome contrast | **Balanced** — readable, not harsh |
| BR7 | Typography | **Rubik** self-hosted **WOFF2** for UI; **Rubik** for lyrics/ChordPro in MVP — **revisit true monospace** if chord columns need it |
| BR8 | Logo & app icon | Authoritative **PNGs** in repo **`resources/`** (`logo_text.png`, `logo_icon.png`, `appicon.png`, `favicon.png`); implement under `app/public/brand/` when the app exists |
| BR9 | Denomination / symbols | **Open** — no default ban on religious imagery; follow provided brand kit |
| BR10 | PWA chrome | **`theme_color`** = **primary**; **`name`** = **Worship Viewer**; **`short_name`** = **Worship** |
| BR11 | Login legal | [Imprint](https://worshipviewer.com/imprint), [Privacy](https://worshipviewer.com/privacy), [Terms](https://worshipviewer.com/terms) |
| BR12 | German locale | Product name stays **Worship Viewer** (English) |

| # | Topic | Decision |
|---|--------|----------|
| 1 | Source of truth | **Remote** when online. Dexie is **offline-only fallback**, always **refreshed on successful fetch**. |
| 2 | Online fetch failure | **No** Dexie fallback while online — show normal error / retry. Dexie used **only when offline**. |
| 3 | Logout | **Wipe all local** (Dexie + Query) on logout; **online** also `POST /auth/logout`; **offline** defer server POST until online. |
| 4 | 401 | Redirect to `/login` and **wipe everything** (same as logout). |
| 5 | Multi-tab / reload | Eviction does not disrupt an **already open** session; after **reload**, use cache if present else **normal error** if evicted. |
| 6 | Eviction during playback | **Finish current** blob/item, then **block advancing** if cache gone. |
| 7 | Byte budget scope | **All** Dexie data used for offline emergency playback (mirrors + blobs + related metadata/indexes). |
| 8 | Pin | **No pin** in MVP; **automatic LRU + budget** only (“always cached” = by policy within retention window, not user pin). |
| 9 | LRU “last opened” | **Player open only** (not editor-only, not prefetch). |
| 10 | Stale server vs cache | **Silent until next player open** after online; then fetch fresh (no blocking out-of-date gate in MVP). |
| 11 | Partial mirror | **Partial OK**; navigate to missing blob/page → error; do not invalidate whole cache. |
| 12 | SW update during play | **Toast + user-controlled reload** (no forced interrupt in MVP). |
| 21 | `/users/me` refresh | **Focus + after login** (not every navigation). |
| 22 | CSRF | **Server/cookie policy**; client assumes no extra token unless API later says otherwise. |
| 26 | Logout offline | **Clear local** Query + Dexie immediately; **server** logout POST **when back online**. |
| 13 | Connectivity flapping | **Immediate** online/offline indicator (no debounce in MVP). |
| 14 | Cache-Control vs SW | **Ignore** API cache headers for mirror rules; follow architecture. |
| 17 | IDB quota | **Evict LRU** + **notify** user. |
| 19 | Offline player scope (MVP) | **Setlists only** for emergency offline; **songs/collections** online-only when offline. |
| 28 | `X-Total-Count` missing | **Assume no next page** if header missing. |
| 31 | Pull-to-refresh scroll | **Jump to top** after refresh. |

### Song editor grill (2026-04-20)

| # | Topic | Decision |
|---|--------|----------|
| A1 | Editing model | **Hybrid:** ChordPro/WorshipPro **source** + **WASM preview**; single parse pipeline for preview and PATCH. |
| A2 | Save | **Debounced PATCH** + **flush** on route change / **Play** (align setlist editor). |
| A3 | PATCH payload | **Full `PatchSongData` snapshot** each save (not sparse field diffs). |
| A4 | Blobs | **Not** managed in song editor **v1** — **player** (or later) scope. |
| A5 | Play unsaved | **Flush save then** navigate to player. |
| A6 | Move / delete song | **List/context only** (not in editor). |
| A7 | `not_a_song` | **Not editable** in song editor — **read-only** from API. |
| A8 | `liked` | **Lists only** — not in editor chrome. |
| A9 | Offline | **Read-only** + explanation; no local drafts. |
| B1 | Validation | **Strict** ChordPro parse — **block save** on parse errors. |
| B2 | Conflicts | **Last-write-wins** — no ETag in v1. |
| B3 | WASM unavailable | **Block** editing until WASM loads (retry); no source-only bypass. |
| B4 | Cmd-K | **Global palette only** — no editor-specific insert flows in v1. |
| B5 | Headline title | **`data.titles[0]`** as primary headline. |
| B6 | Metadata | **Full** metadata strip: subtitle, languages, artists, copyright, tempo, time, key (+ titles alignment with ChordPro). |

Normative detail: [song-editor.md](./song-editor.md).

### Tech stack & PWA grill (2026-04-20)

| # | Topic | Decision |
|---|--------|----------|
| T1 | Production deploy | **Same origin/URL** for SPA and API in production — not a long-term split-origin production contract; `VITE_API_BASE_URL` is for dev/staging flexibility, not a different prod topology. |
| T2 | Workbox runtime / API | **No** Workbox runtime cache for `/api/*` or player JSON in MVP — **precache + SPA nav fallback only**; TanStack Query + Dexie own all API data. |
| T3 | Workbox vs Dexie “disagreement” | **Next successful online fetch** repopulates the Dexie mirror and is authoritative; partial/aborted mirrors stay **partial offline** (same as incomplete mirror rules). |
| T4 | SW update ignored | **Never force** a precache reload in MVP — user always chooses, even if the shell is very stale. |
| T5 | Staging vs prod install | **Separate hostnames/origins** per environment so `start_url` / installed app identity do not collide. |
| T6 | Telemetry + SW | **No** SW-specific or offline-aware analytics pipeline in v1 — basic client errors only. |
| T7 | E2E vs SW | **Playwright** for automated UI in **E10**, plus **minimal SW sanity** (e.g. SW registered / installability); **service worker** **deep** scenarios = manual / periodic smoke (not a mandatory full SW integration suite in v1). |
| T8 | E3 before E4 (PWA before offline) | **Minimal service worker** until **E4** offline Dexie ships — precache + nav fallback; **revisit** runtime rules when implementing **E4**. |
| T9 | Monorepo / WASM layout | **Fixed** documented layout: pnpm workspaces, `packages/chordlib-wasm` ← `crates/chordlib-wasm`, until Tauri changes packaging. |
| T10 | i18next | **Early scaffold:** wrap user-facing copy + at least **one** additional locale for readiness (not English-only string layout forever). |

Normative detail: [tech-stack.md](./tech-stack.md), [pwa-install.md](./pwa-install.md), [architecture.md](./architecture.md).

### Interactive grill (2026-04-21)

*Normative summaries below are promoted into [plan.md](./plan.md), [roadmap.md](./roadmap.md), [app-shell.md](./app-shell.md), [pages-and-flows.md](./pages-and-flows.md), [api-integration.md](./api-integration.md), [architecture.md](./architecture.md), [pwa-install.md](./pwa-install.md), [branding.md](./branding.md), and [tech-stack.md](./tech-stack.md).*

#### Roadmap, naming, and process

| Topic | Decision |
|--------|----------|
| Epic vs “Phase” in docs | Use **E1–E10** only in normative prose; do not use legacy “Phase N” for roadmap milestones. Informal mapping when reading old notes: **E3** = PWA, **E4** = offline MVP + Settings, **E6** = import/export, **E10** = production polish. SW minimal rule references **E4** when Dexie work ships (formerly “Phase 6” in informal talk). |
| E1 branding gate | **E1 exit is blocked** until [branding.md](./branding.md) **intake checklist is fully complete** (not placeholder-only). |
| Production URL | **SPA hosted at `/`** — no production Vite `base` subpath unless product reopens this; OAuth and `return_to` use **same-origin** app paths. |
| OpenAPI drift | **Frontend team** owns regenerating types/client when the API bumps; pair in PR with backend when possible. |
| E10 automated tests | **Playwright** plus **minimal SW sanity** (e.g. service worker registered and/or installability smoke). Full SW/offline automation stays **manual / periodic** in v1. |

#### Shell, navigation, UX

| Topic | Decision |
|--------|----------|
| Bottom nav on desktop | **Same** bottom tab bar everywhere — mouse, touch, keyboard; **no** duplicate top primary rail. |
| iPad without hardware keyboard | **No Cmd-K** — header **search only**; command palette when a **hardware keyboard** is available (iPad/desktop) per [app-shell.md](./app-shell.md). |
| Back from `/player` | Navigate to the **hub list** for that flow (not back into editor). Restore list scroll/top per list docs; focus first sensible element. |
| Long-press discovery | **No** first-run coachmark — document long-press in **Help** (or equivalent entry from Settings). |
| Destructive list actions | **Alert / dialog** (mobile: equivalent sheet) — **Confirm / Cancel** before destructive commit. |
| MVP locales | **English and German** only for the **MVP** product surface; additional locales **out of scope** until a later release (i18next wiring still supports adding more later). |

#### Auth, player rendering, permissions

| Topic | Decision |
|--------|----------|
| OTP / rate limit UX | Surface API **`Problem`** message **inline** on the OTP step; generic copy if body empty. |
| Deep link while logged out | **`return_to`** allowlist: **same origin**, app-internal paths only — **restore path + query** after successful login (no open redirects). |
| chordlib HTML | **Trusted pipeline** for v1 — render WASM/chordlib HTML **without** an extra DOMPurify layer; security relies on chordlib + API/content rules (revisit if untrusted HTML is ever ingested). |
| Player UI state (transpose, etc.) | **Persist** user-selected options for the **player** (transpose, display options, etc.) — **local persistence** (e.g. `localStorage`) scoped to the playing resource so choices survive reload where practical. |
| Read-only teammates | **`+` disabled** with short explanation when the user cannot create on that hub — do not hide without explanation. |
| Server deleted setlist, cache present | **Allow offline play** until online; on successful reconnect / fetch, **reconcile** — remove stale cache and notify (toast/banner). |

#### Resilience, ops, and edge cases

| Topic | Decision |
|--------|----------|
| `Problem` / mutation errors | **Toast-first** for API failures in v1; keep **inline** validation for form field errors. |
| Safari / IDB quota | **Blocking or focused prompt** to clear offline cache or reduce retention — user must choose; do not rely on silent LRU alone when quota blocks writes. |
| Private / ephemeral browsing | **Block or hide PWA install** and offline-heavy features; **online** core flows still work where the browser allows IndexedDB with limits. |
| Print / PDF | **Out of scope** for v1 — no print button or PDF pipeline in the product. |
| WASM load failure in player | **Block** rendering with **retry** — no degraded “source-only” player in v1. |
| Preload adjacent items | **Prefetch next item only** when online (default v1). |
| Header search | **~300 ms debounce**; **cancel** prior in-flight requests when the query changes (`AbortController`). |
| Optimistic mutations | **Reorder** (and similar ordering mutations) **optimistic** with rollback; **delete** and other destructive flows **pessimistic** unless already specified elsewhere. |
| Client telemetry | **No** SW-specific or offline-aware analytics pipeline in v1 — **basic client errors only** (aligns with T6). |
| `VITE_API_BASE_URL` | **Dev/staging** cross-origin **supported** with documented cookie caveats; **production** remains **same-origin** SPA + API. |
| Dark mode + blob scans | **Preserve** original colors — **do not** CSS-invert sheet content; frame with chrome/dimmed surround if needed. |
| Org / team retention policy | **No** org-level offline retention override in MVP — **global LRU + budget** only. |
| Future sync client versions | **Version handshake** — refuse or block join when protocol unsupported; show **upgrade** message. |
| `PlatformCapabilities` | Maintain a **short explicit list** in [architecture.md](./architecture.md) of features that stay behind native / capability checks (e.g. BLE). |
| Blob fetch failures | **Manual Retry** only — **no** automatic multi-retry loop. |
| Large blobs | **Indeterminate** progress + **cancel**; document generous fetch timeout for huge assets. |
| Cmd-K vs header `q` | **Same list `q` semantics** — palette search actions use the **same** query model as hub list search in v1 (no separate omnisearch API). |
| SW / precache staleness | **Never** force precache reload — **no** mandatory refresh even long-term; **no** “escalating nag to forced reload” unless product adds a **separate, explicit** security policy later. |

#### Roadmap / Tauri

| Topic | Decision |
|--------|----------|
| E4 offline exit | **Mandatory** — documented **airplane-mode rehearsal script** in `docs/` (step-by-step) completed before **E5**. |
| Tauri vs web LRU | **Web IndexedDB + Dexie rules** are **authoritative** for LRU when the Tauri shell embeds the SPA; native FS cache adapters **align** with these semantics when they land. |

### E1 foundation grill (2026-04-21)

Pressure-test for **epic E1** only (repo bootstrap → auth → minimal shell → branding + i18n wiring). Normative detail: [roadmap E1](./roadmap.md#e1--identity-layout-and-i18n-foundation), [epic-e1-action-plan.md](./epic-e1-action-plan.md).

| # | Question | Decision |
|---|----------|----------|
| E1.1 | Does E1 implement `/collections`, `/songs`, `/setlists`? | **No.** **E2** owns the three hub routes and **`/` → `/collections`**. E1 ends with a **protected stub** at `/` (placeholder) inside a minimal shell. |
| E1.2 | Dexie is only needed for offline in E4 — is it in E1 at all? | **Yes, minimally.** [api-integration.md](./api-integration.md) requires **Query + Dexie wipe** on logout and **401**. Ship a **versioned Dexie DB** with **empty or placeholder stores** so the same `clearAllLocalData()` path works from day one; **no** mirror logic until E4. |
| E1.3 | Where does the user pick **de** vs **en** before `/settings` exists? | **No manual picker in E1.** Resolve the active locale from **`navigator.languages`** (and similar) mapped to **en** or **de**, else **English** — same rules as “browser default” in [pages-and-flows.md](./pages-and-flows.md). Persist keys Zustand/i18next expects so **E4 Settings** can override without migration pain. |
| E1.4 | Light/dark toggle on login? | **No.** **System / `prefers-color-scheme` only** until **E4 Settings**; avoid shipping a half-broken theme menu on the login screen. |
| E1.5 | Bottom nav, Cmd-K, header search in E1? | **No** hub **bottom nav**, **no** Cmd-K registry, **no** list search — all **E2+** per [app-shell.md](./app-shell.md). E1 shell may be **header + outlet** only (brand-consistent chrome optional but minimal). |
| E1.6 | OTP errors and rate limits? | **Inline** `Problem` body on the OTP step; generic copy if empty — [Interactive grill (2026-04-21)](#interactive-grill-2026-04-21). |
| E1.7 | Deep link `return_to` while logged out? | **Same-origin** path + query **allowlist** only — restore after successful auth; **no** open redirects. |
| E1.8 | When to revalidate `GET /users/me`? | **After login** and on **window/document focus** — not every navigation ([api-integration.md](./api-integration.md)). |
| E1.9 | OpenAPI codegen path in repo? | **`docs/openapi.json`** canonical; script syncs/generates into `app/` (or `packages/api-schema/`) per [api-integration.md](./api-integration.md); **frontend** owns regen on API bumps. |
| E1.10 | Production `base` URL? | **SPA at `/`** — no production Vite `base` subpath; OAuth **`return_to`** stays app-internal. |
| E1.11 | Automated E2E required to exit E1? | **No.** **Manual smoke** (login, refresh, logout, 401 handling) is enough; **Playwright** + **minimal SW** checks are **E10**. |
| E1.12 | Can E1 ship without completing [branding.md](./branding.md) intake? | **No.** **Rubik WOFF2**, **tokens wired**, **icons + favicon** from `resources/` are **blocking** for E1 exit ([Interactive grill (2026-04-21)](#interactive-grill-2026-04-21)). |

#### E1 interactive grill — user session (resolved)

*Product/engineering choices confirmed in Cursor; normative copies below and in [epic-e1-action-plan.md](./epic-e1-action-plan.md).*

| # | Topic | Decision |
|---|--------|----------|
| I1 | Monorepo layout (E1) | **`app/` only** — OpenAPI types + `openapi-fetch` client live under **`app/src/api/`** (or equivalent inside the app). Add **`packages/*`** only when a later epic needs shared packages. |
| I2 | `openapi:sync` default | **Local vendored spec only** — script **copies or reads `docs/openapi.json`** and runs codegen; **no network fetch** in the default path. Refreshing the spec is a **separate explicit step** (manual PR or dedicated task), not implicit in every generate. |
| I3 | Local dev vs API | **Document both**: **Vite proxy** to backend for **`/api`** + **`/auth`** as the **recommended** cookie-auth dev setup (**`VITE_API_BASE_URL` empty**); **cross-origin** with non-empty base URL remains **supported** with **cookie / SameSite** caveats documented. |
| I4 | Login UI (OAuth vs OTP) | **Equal prominence**: **tabs** or **segmented control** — e.g. **“Continue with provider” | “Email code”** (labels i18n’d). |
| I5 | `return_to` during OAuth redirect | **Query param only** — **`return_to`** is carried on **`/auth/login`** and the **server/callback** returns the user to the app; **no** `sessionStorage` mirror for return path in E1. |
| I6 | Locale before Settings | **Persist** the resolved locale (keys aligned with **E4 Settings** / [tech-stack.md](./tech-stack.md)) **and** support a **dev/QA override** (e.g. **`?lang=de`** or **`en`**, and/or a documented localStorage flag) so testers need not change OS language. |
| I7 | TanStack Query: `/users/me` | **`staleTime` in the multi-minute range** (document default e.g. **15 minutes**) plus **`refetchOnWindowFocus`** and **explicit invalidate/refetch after login** — **not** refetch on every route mount. |
| I8 | Logout while offline | **Clear local immediately**; **queue `POST /auth/logout`** when connectivity returns with **minimal retry** (simple fire-and-forget / one-shot queue — **not** the full E4 mutation outbox unless you already introduce it). |
| I9 | Automated tests in E1 | **Vitest** for **pure utilities only** (e.g. `return_to` allowlist, locale resolution). **No** MSW/E2E requirement in E1. |
| I10 | Unknown routes (E1) | **Unauthenticated** → **`/login`**. **Authenticated** → **simple branded “not found” / stub message** (no full product 404 taxonomy until later). |

Promote any changes to exit criteria into [roadmap.md](./roadmap.md); keep this table as the **E1** grill record.

### E2 interactive grill — user session (resolved)

*Product/engineering choices confirmed in Cursor; normative copies below and in [epic-e2-action-plan.md](./epic-e2-action-plan.md).*

| # | Topic | Decision |
|---|--------|----------|
| E2.I1 | List **primary tap** | **Target:** open **`/player`** for the item. **E2:** **no-op** — **normal** row appearance, **no** navigation, **no** **`console`**. |
| E2.I2 | **Create (+)** | **Normal** control; **E2** activation = **no-op** (**no** **`console`**). |
| E2.I3 | **Profile menu** | **Settings / Teams / Sessions** (and **Install** if shown) **look normal**; **no-op** until their epic; **Logout** live. **No** disabled / “Soon” styling. |
| E2.I4 | Context menu **Play** | **Normal** row; **no-op** until player (**E8**); **no** disabled styling, **no** explanation copy, **no** **`console`**. |
| E2.I5 | Context menu **Delete** | **Implement** for real (confirm, mutation, list invalidate) **when OpenAPI supports** DELETE. |
| E2.I6 | **Docs** vs code | Update **[pages-and-flows.md](./pages-and-flows.md)** and **[app-shell.md](./app-shell.md)** in the **same epic** as E2 implementation. |

### E7.1 interactive grill — user session (resolved)

*Product/engineering choices confirmed in Cursor on **2026-05-09**; normative copies live in [epic-e7.1-action-plan.md](./epic-e7.1-action-plan.md) and (where they touch shared UX) in [setlist-editor.md](./setlist-editor.md). Decision-log entry: [plan.md](./plan.md#decision-log) row dated 2026-05-09.*

#### Round 1 — Scope & exit gate

| # | Topic | Decision |
|---|--------|----------|
| E7.1.R1.1 | **Play in editor** | **None.** Editor has **no Play affordance** in E7.1. Wires up in **E8**. |
| E7.1.R1.2 | List **primary tap** | Opens **`/player`** for the setlist (`type` + `id`), **same as** Collections / Songs hubs. **Edit** reachable via **long-press / context menu** (and create/deep links); **not** from primary row tap. |
| E7.1.R1.3 | Demo / shipping loop | **Two distinct flows** mirroring the Teams pattern: **`+` → `CreateSetlistDialog` → POST → editor** for **create**; **long-press Edit** on an existing row → editor for **edit**. |
| E7.1.R1.4 | `return_to` for `/setlists/:id` | **Not allowlisted.** Logged-out deep link to the editor **bounces to `/setlists`** post-login. |
| E7.1.R1.5 | E7.1 release positioning | **Internal milestone only** — no new "Suggested release cut" row in [roadmap.md](./roadmap.md); E7 still requires E7.1–E7.3. |

#### Round 2 — Create vs edit flow

| # | Topic | Decision |
|---|--------|----------|
| E7.1.R2.1 | Create UX shape | **Bottom-drawer dialog** (`CreateSetlistDialog`) **mirroring `CreateTeamDialog`** (Radix `Dialog` + Framer Motion + drag handle). **POST only on Create**, then navigate to `/setlists/{id}`. |
| E7.1.R2.2 | Required fields | **Title** (required, trimmed) **+ team picker** (only when user has >1 writeable team; default last-used; otherwise omitted and server uses personal team). |
| E7.1.R2.3 | Abandoned empty setlist | **Leave it.** No auto-delete, no "discard?" prompt; user can remove via long-press → Delete. |
| E7.1.R2.4 | POST failure UX | **Inline error in the dialog** (`Problem.title` or generic) with **Retry**; dialog stays open; **no toast**. |
| E7.1.R2.5 | Multi-team `owner` | **Picker in the create dialog** (default last-used; persisted in `localStorage`). |

#### Round 3 — Autosave & PATCH contract

| # | Topic | Decision |
|---|--------|----------|
| E7.1.R3.1 | Debounce window | **750 ms** single window for all dirty top-level fields. |
| E7.1.R3.2 | Save-state indicator | **Icon-only** (idle / pending dot / saving spinner / warning) with **`aria-live="polite"`** localized status. |
| E7.1.R3.3 | Flush triggers | Router navigation + **`document.visibilityState === 'hidden'`** + **`pagehide`** + **`beforeunload`** + **before opening picker / Cmd-K insert**. |
| E7.1.R3.4 | In-flight policy | **`block_input`** — all editing affordances disabled during a PATCH; new edits coalesce into the next debounced send (queue depth = 1); no parallel PATCHes. |
| E7.1.R3.5 | PATCH payload shape | **Field-diff per debounce window** — body contains **only the changed top-level fields**; empty diffs do not fire. `songs` is always the full `SongLink[]` when dirty. |
| E7.1.R3.6 | Error recovery | **Block until Retry or Discard.** Inline action row (no toast for save errors). 429 honors `Retry-After` with countdown on Retry. **No silent auto-retry.** |

#### Round 4 — Reorder, picker, Cmd-K, a11y

| # | Topic | Decision |
|---|--------|----------|
| E7.1.R4.1 | DnD library | **`@dnd-kit`** standard set: `core` + `sortable` + `modifiers` + `utilities`. |
| E7.1.R4.2 | Keyboard reorder | **Grab-focus model** via `KeyboardSensor` — Space grab / Arrow move / Space drop / Esc cancel. **No** separate Move-up/down buttons. |
| E7.1.R4.3 | Picker shape | **Bottom drawer everywhere** (phone / tablet / desktop) — same Radix + motion pattern as `CreateTeamDialog`. |
| E7.1.R4.4 | Picker search | **`GET /api/v1/songs?q=…`** with **300 ms debounce + `AbortController`**, `sort=relevance` when `q` non-empty. **No** Recent / Liked tabs in v1. |
| E7.1.R4.5 | Duplicates | **Allowed.** When candidate already in the setlist, show **`Already in setlist (×N)`** badge but tap still adds another instance; no confirm step. |
| E7.1.R4.6 | Cmd-K insert | **Inline song results in the palette** (not the drawer). Enter inserts and closes palette. Shared filtering / duplicate / abort logic with the drawer in **one `useSongPickerQuery` hook**. |

#### Round 5 — Permissions, offline, conflicts, query cache

| # | Topic | Decision |
|---|--------|----------|
| E7.1.R5.1 | Capability source | **Infer from team membership** via the same writeable-team predicate that powers the create dialog. **No** defensive 403 → read-only flip in v1; failures surface via §2.5 error state. |
| E7.1.R5.2 | Offline mid-edit | **Freeze immediately**, **keep typed text in inputs**, cancel debounced PATCH, leave any in-flight PATCH to its `fetch`. **On reconnect:** **Resume editing? (Retry / Discard)** prompt anchored to the save-state icon. **No outbox.** |
| E7.1.R5.3 | Invalid `SongLink.id` | **Row badge "Unavailable"** + **autosave paused with §2.5 error state**; only **Discard** clears (Retry hidden); removing the last broken row resumes autosave. |
| E7.1.R5.4 | Query cache strategy | **`setQueryData`** on `/setlists/:id` detail with PATCH response; **mark `hubListKey('setlists', q)` stale** (no eager refetch). After **POST** (create), **`invalidateQueries`** on the partial `[hubListRootKey, 'setlists']` key. |
| E7.1.R5.5 | Multi-tab conflicts | **Last-write-wins, silent.** No `BroadcastChannel`, no `If-Match`, no post-PATCH cross-tab invalidation in v1. |
| E7.1.R5.6 | Initial load model | **`GET /setlists/{id}` only** + **`GET /songs/{id}`** per slot in parallel once detail resolves (**no viewport gate** in v1). **`/setlists/{id}/songs`** paginated bulk-hydration **NOT used in E7.1** — supersedes the "load all pages" rule in [setlist-editor.md](./setlist-editor.md) §Pagination. Editor unlocks as soon as `/setlists/{id}` resolves. |

#### Round 6 — Dependencies, tests, i18n, out-of-scope

| # | Topic | Decision |
|---|--------|----------|
| E7.1.R6.1 | New runtime deps | **`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/modifiers` + `@dnd-kit/utilities`** (the standard set). |
| E7.1.R6.2 | Test gate | **Required Vitest** for: `SongLink[]` helpers (move/insert/remove/applyOptimistic), autosave coordinator, broken-row detection, field-diff payload. **Optional** component / E2E coverage. |
| E7.1.R6.3 | i18n | **EN + DE** required at exit; **copy text is implementer's discretion** subject to brand voice. New keyspaces: **`setlists.editor.*`** + **`setlists.create.*`**. |
| E7.1.R6.4 | Out-of-scope (explicit) | Enumerated in [epic-e7.1-action-plan.md §0](./epic-e7.1-action-plan.md#0-out-of-scope-explicit) — Play in editor, song detail, collection editor, blob mgmt, ChordEngine/WASM, multi-add, Recent/Liked tabs, IDB outbox / drafts, BroadcastChannel, If-Match/ETag, per-resource permission flag, move-from-editor, delete-from-editor, export rows, import on `+`. |
| E7.1.R6.5 | Phone layout | **Title sticky at top**, song list scrolls beneath; **standard viewport behavior** for on-screen keyboard. No special split-view or modal title editor on phone in v1. |

#### Round 7 — Sanity sweep

| # | Topic | Decision |
|---|--------|----------|
| E7.1.R7.1 | Per-slot key UI | **Inline `Key: G` chip** per row → tap opens popover with **12 keys + Default** option; **Default** sets `SongLink.key` to `null`. Hidden on broken rows. |
| E7.1.R7.2 | Setlist songs endpoint | **`GET /setlists/{id}` only** + per-row lazy `/songs/{id}`. (Confirms R5.6.) |
| E7.1.R7.3 | Decision destinations | **All three:** [setlist-editor.md](./setlist-editor.md) §Play & §Data loading updated, [plan.md](./plan.md#decision-log) row added, this grill-session table created. |
| E7.1.R7.4 | Grill record location | **Full table here in `grill-session.md`** + linked from epic + plan. |
| E7.1.R7.5 | Locked? | **Yes — E7.1 is locked.** |

---

## Offline, caching, and consistency

1. For `GET .../player` while online, is TanStack Query the authority, Dexie a mirror, or Dexie read-first with Query as network refresh? Who wins on conflict?
2. If Workbox caches a `NetworkFirst` player response and Dexie mirrors it, can they disagree after a partial write, retry, or aborted fetch? How do you detect and heal that?
3. What exactly is “sensitive IndexedDB” on logout — full Dexie wipe, selective tables, or preserve offline content after logout (should that exist)?
4. On 401 → `/login`, does “clear stale cache” include Dexie blobs that may contain sheet music? What is the legal/product stance?
5. Two tabs open the same setlist player; one evicts LRU — what happens to the other tab’s `blob:` URLs and in-memory state?
6. User is viewing blob page 3; eviction removes that setlist — hard-stop, error sheet, or preemptive pin?
7. Is the byte budget only blob bytes, or player JSON + indexes + thumbnails + WASM cache? What is included in the default budget?
8. Can a user pin unbounded setlists? If pins exceed the byte budget, what is the enforcement rule?
9. LRU “last opened” — player only, or editor too? Does prefetch count?
10. Setlist changes on server; user has offline copy — on reconnect: auto-refresh, block with “out of date”, or silent upgrade?
11. If mirroring fails halfway through referenced blobs, is the cached setlist valid offline or poisoned?
12. New service worker activates during offline playback — force reload, defer, or other rule?
13. Rapid online/offline toggles — debounce indicator? Cancel in-flight mirrors?
14. If API `Cache-Control` conflicts with the Workbox strategy, which wins?
15. `useBlobUrl` revoke on unmount — what about virtualized lists, route transitions, and prefetch? Any pooling?
16. How do you guarantee `URL.revokeObjectURL` on crash/refresh, or do you accept leaks until eviction?
17. Safari IDB quota / low storage — degradation path (clear auto-cache only, prompt, disable offline)?
18. Private browsing / ephemeral storage — expected behavior when IDB is unavailable?
19. MVP offline parity: song and collection players match setlist emergency mode, or are they intentionally second-class?
20. Create disabled offline — if local drafts ever appear, how do you prevent harmful data-loss expectations?

## Auth, sessions, and security

21. How often is `/users/me` revalidated — app focus, interval, navigation-only?
22. Cookie auth + mutating requests — CSRF posture (token, SameSite) — client vs server ownership?
23. OTP abuse — rate limits, lockout UX, client messaging?
24. Deep link to `/player` while logged out — `return_to` with query params; any open-redirect rules?
25. Team switching / impersonation — any future need that changes the auth gate?
26. Logout while offline — can logout complete? If not, what do you promise about local data?
27. Sheet music blobs — clipboard/screenshots/export: product stance (watermark, block) or honor-system?

## API integration, data, and errors

28. `X-Total-Count` missing or wrong — fallback for `hasNextPage`?
29. `Problem` / `ProblemDetails` — which fields become toast vs inline vs error boundary?
30. Which mutations may use optimistic updates vs forbidden (reorder, delete)?
31. Pull-to-refresh while scrolled deep — jump to top or preserve scroll?
32. Header search — debounce/cancel in-flight rules?
33. Command palette search — same list `q` semantics forever, or separate omnisearch later?
34. Blob `GET` failures — retries, backoff, player messaging?
35. Large blobs — progress UI, timeouts, Range requests?

## Player, rendering, and chordlib / WASM

36. HTML from chordlib/WASM — sanitization (DOMPurify, trusted types, iframe sandbox)?
37. Transpose state — per-song, per-session, or global?
38. Print / PDF — v1 scope: in, out, or browser print only?
39. Orientation / scroll modes — URL, Zustand, or server `Player` as authority?
40. WASM load failure — fallback, retry, block player?
41. A4 layout vs small phones — reflow, minimum font, truncation vs horizontal scroll?
42. Setlists with `chords` and `blob` items — how aggressively preload adjacent items?

## Shell, navigation, UX, accessibility

43. Bottom nav on desktop — accepted tradeoffs for mouse vs keyboard users?
44. iPad without keyboard — is Cmd-K permanently unavailable beyond header search?
45. Back from player to editor — focus restoration where?
46. Long-press ~500ms — first-run hints or power-user only?
47. Destructive context actions — confirm pattern (dialog, sheet step-up)?
48. Offline indicator — exact strings; i18n in v1 or English-only scaffold?
49. Dark default — do blob scans preserve original colors (no inversion)?

## PWA, deployment, and operations

50. Split deploy: `VITE_API_BASE_URL` non-empty vs cookies — still a supported topology or same-origin only in practice?
51. Subpath `base` (e.g. `/app`) — OAuth `return_to` and deep links: full test matrix defined?
52. `start_url` / scope — staging vs prod installs without collisions?
53. Update toast ignored — how long tolerate stale precache before forced refresh?
54. Client telemetry — any analytics that interact with offline or the service worker?

## Teams, permissions, and product edge cases

55. Read-only teammates — hide `+` per capability or disable with explanation?
56. Offline cache for server-deleted setlist — explicit “removed on server” state?
57. Offline retention — org/team policy variance for copyrighted material?

## Sync, Tauri, and future ports

58. Future `PlayerEvent` sync — versioning / mismatched clients in one room?
59. `PlatformCapabilities` — which features must not ship in web without the port?
60. Native Tauri cache vs web IDB — how to keep LRU semantics consistent across shells?

## Roadmap and decision hygiene

61. Phase 5 (PWA) before Phase 6 (offline) — any SW caching choices that block later Dexie rules?
62. “Offline MVP” exit — explicit airplane-mode rehearsal script?
63. Branding open items — block Phase 1 exit or ship placeholders?
64. OpenAPI drift — who regenerates types on breaking backend changes (process owner)?
65. **E10** E2E — Playwright only, or minimum service-worker-aware coverage?

### E8 interactive grill — user session (resolved)

*Implementation choices locked during **E8** ([epic-e8-action-plan.md](./epic-e8-action-plan.md)); verified against [`player-keyboard.ts`](../app/src/lib/player/player-keyboard.ts) and hub completion pass (2026-05-22).*

| # | Topic | Decision |
|---|--------|----------|
| E8.R1 | **Keyboard shortcuts** | **Prev:** ↑, PgUp, ←, Backspace, `k`. **Next:** ↓, PgDn, →, Space, Enter, `j`. **Home/End** jump. **`m`** toggle chrome, **`s`** cycle scroll mode, **`e`** edit resource, **`l`** like, **`n`** chord format. **Transpose:** `A`–`G` set key, `b`/`-` down, `#`/`+` up, `r` reset (also when transpose popover open). **Esc** closes overlay or exits. Ignored when input/textarea/contenteditable focused; most keys suppressed while transpose popover open. |
| E8.R2 | **TOC drawer anchor** | Bottom sheet on narrow viewports; **right-anchored sheet** at **`≥ md`**. Focus trap while open; respects **`prefers-reduced-motion`**. |
| E8.R3 | **Swipe priority** | Horizontal swipe prev/next when \|dx\| > 48px and horizontal dominates; vertical scroll not hijacked. |
| E8.R4 | **View state storage** | Player scroll prefs in `localStorage` (`wv_player_scroll_*`); hub list/card per entity in `wv.hub.viewMode.{entity}`. |
| E8.R5 | **PDF blobs** | Native `<embed>` only in v1 (no pdf.js). |
| E8.R6 | **Collections layout** | **Settings → Collections layout** (list or cards). Songs and setlists are list-only. |
| E8.R7 | **Hub Duplicate** | Long-press **Duplicate** on setlists/collections → GET detail, POST copy with `(copy)` suffix, navigate to new editor. |
| E8.R8 | **CI gate** | GitHub Actions **`frontend-ci.yml`**: `pnpm -C frontend` test, typecheck, lint, build (+ `build:wasm`). |

### E8.1 interactive grill — user session (resolved)

*Implementation choices locked during **E8.1** ([epic-e8.1-action-plan.md](./epic-e8.1-action-plan.md)).*

| # | Topic | Decision |
|---|--------|----------|
| E8.1.R1 | **Mode launch** | Optional `/player?mode=normal\|av`; omit → global default from Settings. No in-player mode switch in E8.1. |
| E8.1.R2 | **Context menu Play** | **Play in Normal mode** and **Play in AV mode** replace single Play on hub rows. Editor Play uses global default. |
| E8.1.R3 | **AV keyboard** | Separate map from Normal (`av-keyboard.ts`): nav keys, **`R`** blackout on, **`r`** off, **`b`** toggle, section jumps `c`/`v`/`1`–`4`. |
| E8.1.R4 | **Projection output** | Dual-window via `/player/output?s=`; **`BroadcastChannel` + localStorage** sync. Popup blocked → persistent single-screen warning + reopen control. |
| E8.1.R5 | **AV layers** | **Content** and **background** modeled separately in `av-preferences.ts`; blob items render one title slide from TOC. |
| E8.1.R6 | **Settings tab** | **`/settings?tab=playerRoles`** — default mode, content, background, transitions, projection prefs; AV player quick-link opens this tab. |

## Related docs

- [Plan index](./plan.md)
- [Epic E1 action plan](./epic-e1-action-plan.md)
- [Architecture](./architecture.md)
- [API integration](./api-integration.md)
- [Setlist editor](./setlist-editor.md) (decisions promoted from grill 2026-04-20)
- [Song editor](./song-editor.md) (decisions promoted from grill 2026-04-20)
