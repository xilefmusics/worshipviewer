# Pages and flows

## Route table

**E1 vs E2:** **E1** used a **minimal stub** at **`/`**; **E2** ships the **three hub lists** and **`/` → `/collections`** for signed-in users (see [roadmap E2](./roadmap.md#e2--three-hub-lists-collections-songs-setlists)).

| Route | Page | Notes |
|-------|------|--------|
| `/login` | Login | **OAuth** and **email OTP** with **equal prominence** (tabs or segmented control). **Marketing copy + footer legal links** — [branding.md](./branding.md). See [E1 interactive grill](./grill-session.md#e1-interactive-grill--user-session-resolved). |
| `/` | Redirect | → `/collections` when authenticated ([epic E2](./epic-e2-action-plan.md)). |
| `/collections` | Collections list | Default **card** view (A4 cover aspect). **Primary tap / Enter / Space** → **`/player`** (`type=collection`). **FAB +** → **`CreateCollectionDialog`** (`?new=1` latch); success → **`/collections/:id`**. **Edit** via long-press / context menu. Long-press **Export** → **PDF (print)** — all songs in collection order, one multi-page print job ([E6](./epic-e6-action-plan.md)). |
| `/songs` | Songs list | Default **list** view. **FAB +** → chooser **New song** \| **Import files** ([E6](./epic-e6-action-plan.md)). Long-press **Export** (ChordPro / Worship Pro / PDF). |
| `/setlists` | Setlists list | Default **list** view. **FAB +** opens **create setlist** when the team library is writable; after create, navigate to **`/setlists/:id`**. Long-press **Export** → **PDF (print)** — all songs in setlist order, one multi-page print job ([E6](./epic-e6-action-plan.md)). |
| `/collections/:id` | Collection editor | **[E7.2](./epic-e7.2-action-plan.md)** — parity with **`/setlists/:id`**: picker, Cmd-K, reorder, **`SongLink.nr`**, slot keys (**[setlist-editor](./setlist-editor.md)**). **No Play** in-editor until **E8**; use hub row / **`/player`**. **`/collections/:id`** is **not** allowlisted for **`return_to`** (logged-out bounce → **`/collections`**). Next: **[E7.3](./epic-e7.3-action-plan.md)** |
| `/songs/:id` | Song editor | ChordPro/WorshipPro via chordlib; **Import / Export** overflow menu ([E6](./epic-e6-action-plan.md)); play opens player. See [Song editor](./song-editor.md). |
| `/setlists/:id` | Setlist editor | Autosave: reorder, slot keys, add/remove songs ([setlist-editor.md](./setlist-editor.md)). **No Play in the editor** in E7.1 — open **`/player`** from the hub row or context menu; editor Play lands in **E8**. |
| `/player` | Player | Book mode; **query** `type` (song, setlist, or collection) and `id` (resource id). Maps to the matching `GET /api/v1/songs/{id}/player`, `GET /api/v1/setlists/{id}/player`, or `GET /api/v1/collections/{id}/player`. **No app shell** — see [App shell](./app-shell.md). |
| `/settings` | Settings | **Language**, **appearance** (light / dark / system), cache, account shortcuts. |
| `/teams` | Teams list | Tap → team editor. |
| `/teams/:id` | Team editor | Members, invitations. |
| `/sessions` | Sessions list | Current user’s sessions; revoke/delete. |

All routes are **deep-linkable** and must work after PWA standalone reload (client-side router + `index.html` fallback). **`/login` + `return_to`:** only **same-origin** app paths are allowed — **restore full path + query** after successful auth (no open redirects). Host production SPA at **`/`** (see [plan.md](./plan.md#decision-log)).

## Settings (`/settings`)

- **Language:** User picks a **concrete locale** (every shipped language the app supports) **or** **Use browser default**. **MVP ships English and German only**; additional locales are out of scope until a later release (i18next wiring can add more without structural change). When browser default is selected, resolve the active locale from the browser’s language list (for example `navigator.languages`) and map it to the nearest **supported** app locale. If the browser preference does **not** match any shipped locale, **fall back to English** for UI strings.
- **Appearance:** User picks **Light**, **Dark**, or **Use browser default** (follow `prefers-color-scheme` so the theme tracks OS / browser light–dark mode until the user chooses an explicit override).

## Auth gate

```mermaid
flowchart TB
  Start[App load]
  Check{Session valid?}
  Me[GET /users/me]
  Login[/login]
  App[Main shell + tabs]
  Start --> Check
  Check -->|unknown| Me
  Me -->|200| App
  Me -->|401| Login
  Check -->|no cookie| Login
```

- After OTP verify or OAuth callback, hydrate TanStack Query with `/users/me` and navigate to `/` or **`return_to`** (allowlisted same-origin path, **including query string**). Surface API **`Problem`** bodies **inline** on the OTP screen when login is throttled or rejected; generic fallback copy if the body is empty.

## High-level navigation

```mermaid
flowchart TB
  AuthGate{Signed in?}
  Login[Login]
  Home[Collections - default landing]
  Songs[Songs list]
  Sets[Setlists list]
  Colls[Collections list]
  SongEd[Song editor]
  SetEd[Setlist editor]
  CollEd[Collection editor]
  Player[Player - book mode]
  Settings[Settings]
  Teams[Teams list]
  TeamEd[Team editor]
  Sessions[Sessions list]
  AuthGate -- No --> Login
  AuthGate -- Yes --> Home
  Home --> Songs
  Home --> Sets
  Home --> Colls
  Songs -->|tap| Player
  Sets -->|tap| Player
  Colls -->|tap| Player
  Colls -->|Edit| CollEd
  Songs -->|Edit| SongEd
  Sets -->|Edit| SetEd
  SongEd -->|play| Player
  CollEd -->|play| Player
  Home --> Settings
  Home --> Teams
  Teams -->|tap| TeamEd
  Home --> Sessions
```

Hub lists (**collections / songs / setlists**) use **primary tap** → **`/player`** (`type` + `id`). The **setlist editor** does **not** include **Play** in **E7.1** — playback stays on the hub row / context menu until **E8** adds flush-from-editor Play ([setlist-editor.md](./setlist-editor.md)).

## List → editor → player

1. **List**: User scrolls; **infinite query** with **Load more** (see [API integration](./api-integration.md)). **Primary tap** on **collections / songs / setlists** → **`/player`**. **E2** originally shipped **silent no-op** taps until navigation landed ([epic-e2-action-plan.md](./epic-e2-action-plan.md)); today those hubs navigate into the player when implemented. **Long-press** (~500 ms) or **right-click** → actions (**Edit**, **Delete**, **Play**, Duplicate where applicable). **Editors** (`/collections/:id`, `/songs/:id`, `/setlists/:id`) are reached from **long-press Edit**, deep links, or **Create** — **not** from primary tap on hub rows (tap opens **`/player`**). **Pull-to-refresh** on `/collections`, `/songs`, and `/setlists` refetches the first page (TanStack Query invalidate) and **scrolls to top** afterward (see [App shell](./app-shell.md)). **Teams** (`/teams`) and **Sessions** (`/sessions`) use the **same** tap / long-press / right-click patterns as primary lists, with actions limited to what each entity supports (e.g. revoke/delete on sessions).
2. **Editor**: Save via PATCH/PUT per resource. **Song / collection editors:** **Play** navigates to `/player` where shipped ([song-editor.md](./song-editor.md)). **Setlist editor (E7.1):** autosave via PATCH — **no Play affordance inside the editor**; use the hub ([setlist-editor.md](./setlist-editor.md), [epic-e7.1-action-plan.md](./epic-e7.1-action-plan.md)).
3. **Player**: Renders **without** main app shell; **book** navigation (TOC, scroll modes per API `Player`: `scroll_type`, `orientation`, `between_items`, `index`, `items`, `toc`). Fullscreen **browser** chrome is addressed by **PWA standalone** install, not by a separate in-app route. **Back / navigate out** of the player lands on the **appropriate hub list** (or prior list route) — **not** automatically in the editor, unless a future flow explicitly returns to an editing context. **Player-selected** state (transpose, view options, etc.) **persists locally** (e.g. `localStorage`) per resource where practical. **Chordlib HTML** renders as **trusted output from our WASM pipeline** — no extra DOMPurify layer in v1. If **WASM fails to load**, **block** the player with **retry** (no degraded text-only mode in v1). **Print / PDF** — **out of scope** for v1. **Prefetch** the **next** setlist player item only when online (default).

### List screens — loading, empty, and errors (v1)

| Situation | Behavior |
|-----------|----------|
| **Initial load** | **Skeleton** rows (list) or **skeleton** cards (card view / collections) matching final layout — not a full-screen blocking spinner. |
| **Load more** | **IntersectionObserver** at list bottom auto-loads the next page; an explicit **Load more** control remains available as a fallback (e.g. keyboard and screen-reader friendly). |
| **Initial fetch fails** | Keep app shell; show an **inline error** in the list content area (not a full-screen takeover) with **Retry**. |
| **Empty library** (success, no `q`) | Short copy that this list is empty; **Create** where the route allows; avoid implying a failed search. |
| **No search results** (`q` non-empty) | **Distinct** from empty library: e.g. “No results for …” and a **Clear search** (or equivalent) control. |

**Sort / filters (v1):** No sort chips or filter UI beyond **search** on list screens; API defaults apply (with **`sort=relevance`** when `q` is set — see [API integration](./api-integration.md)). **Setlists hub only:** after each fetch the client **sorts the concatenated pages by title** (numeric-aware **descending**) so browsing stays stable regardless of API ordering. **Card** view for songs/setlists shows the **same fields** as list rows; only layout changes.

**Back from setlist editor:** Navigating back to `/setlists` **scrolls the list to the top** (see [setlist-editor.md](./setlist-editor.md)).

## API alignment

- **Player** model (`Player`, `PlayerItem` discriminated `blob` | `chords`) drives rendering: chord sheets vs sheet-music blobs.
- **Blob** assets: resolve `blob_id` via `GET /api/v1/blobs/{id}/data` with caching.

## Related docs

- [App shell](./app-shell.md)
- [API integration](./api-integration.md)
- [Setlist editor](./setlist-editor.md)
- [Song editor](./song-editor.md)
