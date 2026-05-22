# Roadmap

Work is grouped into **epics** in **strict order**. Each epic is a **complete increment**: shippable, demoable value on its own. **Install + offline** land **right after** the three hub lists so the browse experience can become **installable** and **resilient** before any **write** work. **Team management** (and related account routes) ships **before** **library import/export** and the **content editors** and **player**. Later epics add platform ports and polish.

## How to read this


| Column         | Meaning                                  |
| -------------- | ---------------------------------------- |
| **Outcome**    | Standalone value when this epic is done. |
| **Exit**       | Objective checks before the next epic.   |
| **Depends on** | Prior epic id.                           |


**Epic ids** (`E1` … `E10`) are stable labels for planning and issue linking.

---

## Dependency chain

```mermaid
flowchart LR
  E1[E1 Foundation]
  E2[E2 Three hub lists]
  E3[E3 PWA]
  E4[E4 Offline MVP]
  E5[E5 Teams and sessions]
  E6[E6 Import and export]
  E7[E7 Content editors]
  E8[E8 Player]
  E9[E9 Sync and Tauri]
  E10[E10 Production polish]
  E1 --> E2 --> E3 --> E4 --> E5 --> E6 --> E7 --> E8 --> E9 --> E10
```



---

## E1 — Identity, layout, and i18n foundation

**Outcome:** Users can **log in**, the shell reflects **locale** and **layout**, and the app uses **typed API** clients. No feature pages yet beyond what auth requires.

**Depends on:** — (repo + OpenAPI spec available).

**Entry:** Repo bootstrap; OpenAPI spec available.

**Step-by-step execution:** [epic-e1-action-plan.md](./epic-e1-action-plan.md).

**Exit:**

- pnpm workspace with `app/` Vite + React + TS strict
- Tailwind v4 + shadcn baseline + **production branding applied** — [branding.md](./branding.md) **intake checklist complete** (E1 is **not** allowed to ship on placeholder tokens alone)
- TanStack Router + TanStack Query wired
- openapi-typescript + openapi-fetch codegen from OpenAPI (**frontend** owns regeneration when the API bumps — see [api-integration.md](./api-integration.md))
- Auth: OAuth entry + OTP verify + `GET /users/me` + logout; `**return_to`** same-origin allowlist; **401** and logout run the **same local cleanup** as [api-integration.md](./api-integration.md) (Query + Dexie wipe — Dexie may be **empty schema** until E4)
- **Minimal** layout shell: **protected** post-login **stub** at `/` (placeholder content, **no** three-hub lists or `/collections` — those are **E2**); outlet + root error boundary acceptable; **no** bottom tab bar for library hubs until E2
- **i18next** baseline: **English** (fallback) and **German** for MVP copy; locale **resolution** per [tech-stack.md](./tech-stack.md) and [pages-and-flows.md](./pages-and-flows.md) — **Settings** language/appearance controls ship in **E4**; E1 uses **browser-mapped** locale + **system** appearance only

---

## E2 — Three hub lists (collections, songs, setlists)

**Step-by-step execution:** [epic-e2-action-plan.md](./epic-e2-action-plan.md).

**Outcome:** Users can **browse** the worship library: **Collections**, **Songs**, and **Setlists** with real data — pagination, search/filters where the API supports, skeleton/empty/error behavior per [pages-and-flows.md](./pages-and-flows.md). Default layouts: collections **cards** (A4 cover aspect), songs and setlists **rows**; **list/card toggle** persists per hub ([app-shell.md](./app-shell.md)).

**Depends on:** E1.

**Exit:**

- Authenticated **`/`** redirects to **`/collections`**
- Routes `/collections`, `/songs`, `/setlists` with load-more pagination; search/filters where API supports
- **Collections layout** in **Settings** (list or cards); songs and setlists always use **list** view; preference stored in `wv.hub.viewMode.collections`
- App shell: **quick nav** among the three hubs; **phone** header **simple search**; **tablet/desktop** **Cmd-K** with `cmdk` + command registry ([`hub-commands.ts`](../app/src/commands/hub-commands.ts))
- **`useLongPress`** (~500 ms) opens context menu; **haptics** where supported
- **Primary tap** → **`/player`** (E8); **long-press** includes Edit, Play, Delete, Export, **Duplicate** (setlists/collections)
- **Profile menu:** Settings, Teams, Sessions, Install, Logout — all routable

---

## E3 — Progressive Web App (install + update UX)

**Outcome:** The list experience is **installable** (where the platform supports it): manifest, maskable icons, **minimal** service worker — **precache** hashed assets + **SPA `index.html` navigation fallback** only; **no** Workbox runtime cache for `/api/`* — [pwa-install.md](./pwa-install.md), [architecture.md](./architecture.md). **Install** entry in the profile menu can go from placeholder to **working** here.

**Depends on:** E2.

**Exit:** Manifest, maskable icons, vite-plugin-pwa, install flows (Android/Desktop `beforeinstallprompt`, iOS instructions), update toast — constraints as in linked docs.

---

## E4 — Offline MVP + Settings (cache)

**Outcome:** **Setlist** emergency playback: Dexie mirror for last-opened **setlist** players + blobs (LRU last **N**); **offline indicator**; **setlist** playback without network when cached. Song/collection players **online-only** offline; **content editing** stays **online-only**. `**/settings`** is real: **language**, **appearance**, and **offline cache** (size + clear) per [pages-and-flows.md](./pages-and-flows.md) and [architecture.md](./architecture.md). *Offline rules assume the **minimal SW** from E3; Dexie owns mirrored data, not Workbox for `/api/`*.*

**Depends on:** E3.

**Exit:**

- As architecture offline MVP: Dexie mirror for last-opened setlist players + blobs; LRU; indicator near avatar; **Settings** — cache size + clear; setlist emergency playback
- `**/settings`** includes language + appearance + cache controls (full Settings page coherent with offline story)
- **Airplane-mode rehearsal:** follow the step-by-step script in [offline-rehearsal.md](./offline-rehearsal.md) (or successor) — tick before **E5**

---

## E5 — Teams and sessions management

**Outcome:** **Org and account** workflows **before** song/setlist/collection **writes**: `**/teams`** list, `**/teams/:id`** (members, **invitations**), `**/sessions`** with **revoke** per API. Cmd-K and profile menu register these routes. Standalone value: **administer who can use the app** before investing in library authoring.

**Depends on:** E3. **E4 deferred:** teams and sessions use online REST APIs only; E4 offline rehearsal and Settings are **not** a prerequisite for this increment (complete E4 before claiming the full “installable + offline” release cut).

**Exit**

- Teams list, team editor, invitations; sessions list with revoke per API
- Profile menu + Cmd-K **Navigate** include E2–E5 destinations

---

## E6 — Library import and export

**Outcome:** Users can **round-trip** worship library files **before** full in-app editors land: **export** **songs**, **setlists**, and **collections** as **PDF**, **ChordPro**, or **WorshipPro**; **import** **ChordPro** or **WorshipPro** from **one or multiple** files in a single action. **PDF** export uses the browser’s **print** path on **rendered song HTML** in the **background** (non-blocking main UI) and offers the result as a **download**. **Import** is reached by extending the shell **+** affordance: **New** (existing create flow) vs **Import** (file upload). Setlist and collection export applies the **same format choices** as single-song export (bundling vs multiple files follows API and product constraints documented at implementation time).

**Depends on:** E5.

**Exit:**

- **Long-press** (or equivalent primary row action) on **song**, **setlist**, and **collection** list items includes **Export** with **PDF**, **ChordPro**, and **WorshipPro**
- **PDF:** background print of **HTML** representation → user gets a **PDF** download; works for **single song** and for **whole setlists / collections** per scope above
- **+** control: **New** vs **Import**; import = single multi-select file upload, **ChordPro** and **WorshipPro** only; **one or many** files in one batch
- Partial import failures reported clearly; i18n for new strings (**EN** + **DE** MVP)

---

## E7 — Content editors (collections, songs, setlists)

**Step-by-step execution:** [E7 index](./epic-e7-action-plan.md) — [E7.1](./epic-e7.1-action-plan.md) setlist (**no** WASM); [E7.2](./epic-e7.2-action-plan.md) collection (**no** WASM); [E7.3](./epic-e7.3-action-plan.md) song editor + **ChordEngine** / chordlib. **Skip E6** rules: [§0](./epic-e7-action-plan.md#0-skipping-e6--scope-adjustments).

**Outcome:** Users can **create and change** library content: **collection**, **song**, and **setlist** editors with reorder/move per API, PATCH flows, and **song** ChordPro/WorshipPro editing with **in-editor** DIN-A4 **preview** via **chordlib WASM** behind `**ChordEngine`** (reused in **E8**).

**Depends on:** E6 (or **E5 + explicit E6 deferral** — see [E7 index §0](./epic-e7-action-plan.md#0-skipping-e6--scope-adjustments)).

**Exit:**

- `/collections/:id`, `/songs/:id`, `/setlists/:id` per [setlist-editor.md](./setlist-editor.md), [song-editor.md](./song-editor.md), and API (incremental: [E7.1](./epic-e7.1-action-plan.md), [E7.2](./epic-e7.2-action-plan.md), [E7.3](./epic-e7.3-action-plan.md); [E7 index](./epic-e7-action-plan.md))
- Lists link to editors; long-press / row actions complete where spec’d (**export** from **E6**, **Duplicate** for setlists/collections via `duplicate-hub-entity.ts`)
- chordlib WASM for **song** editor preview — `**ChordEngine` port** established for reuse in **E8** (**E7.3**)

---

## E8 — Player (book mode)

**Step-by-step execution:** [epic-e8-action-plan.md](./epic-e8-action-plan.md).

**Outcome:** **Book-mode playback** at `/player?type=&id=` via `GET .../player` APIs; `**Player`** model (`blob` vs `chords`); `**useBlobUrl`**; **ChordEngine** in **player** context. **No main app shell** on player per [app-shell.md](./app-shell.md).

**Depends on:** E7.

**Exit:**

- Route `/player` with query `type` + `id` (+ optional `index`)
- Renders `Player` model; `useBlobUrl` for blob data
- **Play** from lists/editors works end-to-end
- **Vitest in CI** — [`.github/workflows/frontend-ci.yml`](../../.github/workflows/frontend-ci.yml) runs test, typecheck, lint, build on `frontend2/**`

---

## E9 — Sync transport and Tauri readiness

**Outcome:** `**SyncTransport`** port + inert **“Paired devices”** UI; `**PlatformCapabilities`** port; validate `**dist/`** in **Tauri** shell (no feature-complete native audio yet).

**Depends on:** E8.

**Exit:**

- `SyncTransport` + `PlatformCapabilities` **ports** and inert **“Paired devices”** UI as specified in [architecture.md](./architecture.md)
- Static `**dist/`** loads in **Tauri** shell (smoke validation; native audio not required)
- **Offline / LRU semantics:** web **IndexedDB + Dexie** rules remain **authoritative**; document how future native blob adapters must **align** (see [architecture.md](./architecture.md))

---

## E10 — Production polish

**Outcome:** a11y, i18n polish, performance budget (lazy routes, lazy WASM), **Playwright** smoke (login + list + player) plus **minimal** automated SW sanity (e.g. SW registered / installability), **manual / periodic** deeper SW smoke — not a mandatory full SW integration gate in v1 unless expanded.

**Depends on:** E9.

**Exit:**

- Above outcome met; **Playwright** suite green in CI
- **Optional locales** beyond **English + German** may land here if prioritized post-MVP (MVP ships **DE + EN** per [tech-stack.md](./tech-stack.md))

---

## Suggested release cuts (optional)


| Milestone                 | Epics  | Narrative                                                                         |
| ------------------------- | ------ | --------------------------------------------------------------------------------- |
| **Browse-only**           | E1–E2  | Auth + three hub lists.                                                           |
| **Installable + offline** | E1–E4  | PWA shell + setlist emergency mode + Settings.                                    |
| **Org-ready**             | E1–E5  | Teams and sessions administration before authoring.                               |
| **Interchange**           | E1–E6  | Import/export ChordPro, WorshipPro, and PDF for songs, setlists, and collections. |
| **Authoring**             | E1–E7  | Full CRUD on library entities.                                                    |
| **Rehearsal-ready**       | E1–E8  | Player completes the core loop.                                                   |
| **Platform-ready**        | E1–E9  | Sync/Tauri adapters.                                                              |
| **GA**                    | E1–E10 | Polish + automated smoke.                                                         |


---

## Related docs

- [Plan index](./plan.md)
- [Offline rehearsal](./offline-rehearsal.md) (E4 exit)
- [Pages and flows](./pages-and-flows.md)

