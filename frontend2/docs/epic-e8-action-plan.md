# Epic E8 — Player (book mode)

**Parent:** [E8 — Player (book mode)](./roadmap.md#e8--player-book-mode)

**Prerequisite:** [E7](./epic-e7-action-plan.md) complete (setlist + collection + song editors, **`ChordEngine`** + chordlib WASM port shipped in [E7.3](./epic-e7.3-action-plan.md)).

**Normative UX:** [pages-and-flows.md](./pages-and-flows.md), [app-shell.md](./app-shell.md), [setlist-editor.md](./setlist-editor.md), [song-editor.md](./song-editor.md), [api-integration.md](./api-integration.md), [architecture.md](./architecture.md), [openapi.json](./openapi.json).

**Next:** [E9 — Sync transport and Tauri readiness](./roadmap.md#e9--sync-transport-and-tauri-readiness)

---

## Outcome

**Book-mode playback** at **`/player?type=&id=`** that:

- Renders the full `Player` model (`items` + `toc` + `scroll_type` + `orientation` + `between_items` + `index`) — not just the prev/next slot navigation E4 shipped.
- Supports both `PlayerItem` variants (**`blob`** sheet music / **`chords`** ChordPro song) with the WASM `ChordEngine` from **E7.3** (no second WASM init).
- Wires **Play** from each editor (setlist, collection, song) with **flush-before-Play** autosave per [setlist-editor.md](./setlist-editor.md) / [song-editor.md](./song-editor.md).
- Persists per-resource view state (transpose, scroll mode, orientation) per [grill 2026-04-21 — Player UI state](./grill-session.md#auth-player-rendering-permissions).
- Reads from Dexie when offline (**setlist** only, per [E4 architecture rules](./architecture.md#offline-strategy-mvp)); blocks with retry on WASM failure ([grill](./grill-session.md#resilience-ops-and-edge-cases)).
- Carries **no app shell** (no bottom tab bar, no `+` FAB, no profile cluster — see [app-shell.md](./app-shell.md#shell-layout-all-breakpoints)).

## Exit (E8) — completes roadmap E8

- **Route `/player`** with `type` + `id` query (already shipped in E4) renders the **full** `Player` model end-to-end for **song**, **setlist**, **collection**.
- **`useBlobUrl`** hook owns blob fetch / cache / `URL.createObjectURL` lifecycle (current ad-hoc logic in `PlayerRoute.tsx` is replaced).
- **`Play` from lists and editors** works end-to-end (hub long-press Play already navigates as of E2/E7.1; editors gain a Play affordance with flush per spec).
- **TOC drawer** lets the user jump to any `TocItem` in O(1); **scroll mode** + **orientation** controls switch between the `ScrollType` values backed by `scroll_type_cache_other_orientation` cache rules.
- **Transpose / view state** persisted to `localStorage` per `${type}:${id}` and rehydrated on revisit.
- **WASM failure** blocks the player with a retry; **eviction during playback** finishes the current item then blocks advance per [architecture.md](./architecture.md#consistency-decided).
- **i18n** EN + DE for all new player-surface strings.
- Required Vitest suites green in CI (see [§7](#7-tests)).

---

## 0. Out of scope (explicit)

The following are **deliberately not** in E8. They belong to later epics and should not be added under cover of "polish":

| Topic | Where it belongs |
|-------|------------------|
| **`SyncTransport`** wiring (WebSocket / BLE rooms, "Paired devices" badge functional) | **E9** — port + inert badge already documented in [architecture.md](./architecture.md#sync-player-readiness-not-implemented-yet) |
| **Tauri shell smoke** + native blob adapter | **E9** |
| **Print / PDF from `/player`** | **Out of scope v1** per [grill 2026-04-21](./grill-session.md#resilience-ops-and-edge-cases). PDF **export** lives in **E6**, not the player. |
| **Native fullscreen API** (Fullscreen API toggle) | Standalone PWA install removes browser chrome (E3); a separate `requestFullscreen` toggle is **not** in v1. |
| **Multi-display / projector cast** | Future — not in v1. |
| **Audio playback / metronome / click track** | Future / native shell. |
| **`liked` toggle inside the player** | **Lists only** — same rule as song editor ([song-editor.md](./song-editor.md#play-navigation)). |
| **Edit affordance inside the player** | None. Player is read-only chrome; **Back** returns to the **hub list** ([grill](./grill-session.md#shell-navigation-ux)). |
| **Annotations / freehand markup** | Future. |
| **Set "current TOC row" via long-press** | Not in v1; TOC drawer tap is the only TOC affordance. |
| **`If-Match` / ETag** for `/player` fetches | Not in v1 (last-write-wins everywhere, same as editors). |
| **Server-side `Player` refresh while the player is open** (background poll) | Not in v1. The fetched payload is the snapshot until back/forward navigation. |
| **Per-team / per-org transpose policy** | Not in v1 — transpose is **local** per resource per [grill](./grill-session.md#auth-player-rendering-permissions). |

---

## 1. Inventory — what E2/E4 already shipped vs what E8 adds

E8 is not a greenfield epic. Audit the existing surface first so we extend, not duplicate.

**Already in tree (do not re-implement; refactor in place):**

- **Route** `/player?type=&id=` ([`app/src/routes/player.tsx`](../app/src/routes/player.tsx)) with `validateSearch` + `requireSession`.
- **`PlayerRouteInner` + `PlayerBook`** ([`app/src/components/player/PlayerRoute.tsx`](../app/src/components/player/PlayerRoute.tsx)) — prev/next nav between `items`, header back link, footer prev/next buttons.
- **`BlobSlide`** in the same file — fetches via `fetchBlobBinaryWithMime` or Dexie, creates `URL.createObjectURL`, revokes on unmount, branches `image` vs `pdf`.
- **`ChordsSlide`** ([`app/src/components/player/ChordsSlide.tsx`](../app/src/components/player/ChordsSlide.tsx)) — calls `getChordEngine().renderA4Html` from the WASM port, scopes page CSS via `scopeChordlibPageCss`, scales for viewport (`viewportScaleForA4`), retry on render failure.
- **Online/offline resolver** ([`app/src/lib/offline/resolve-player.ts`](../app/src/lib/offline/resolve-player.ts)) — setlist mirror via Dexie; song/collection online-only.
- **`hubEntityToPlayerType`** + **`buildPlayerSearchParams`** helpers ([`app/src/lib/player-route.ts`](../app/src/lib/player-route.ts)).
- **Hub list primary tap + long-press Play** wired to `/player` (E2 → E7.1) — see `useHubListItemPlayerTap` in [`EntityListView.tsx`](../app/src/components/hub/EntityListView.tsx).

**E8 must add:**

1. **TOC drawer** (currently `Player.toc` is unread).
2. **Scroll mode switch** (`ScrollType`: `one_page` / `half_page` / `two_page` / `book` / `two_half_page`) + the `scroll_type_cache_other_orientation` round-trip when toggling orientation.
3. **Orientation switch** (`portrait` / `landscape`) using the cache field above.
4. **`between_items` semantics** — when `true` and `scroll_type === 'book'`, prev/next jumps **whole items**; otherwise it scrolls within an item before crossing the boundary.
5. **Per-resource view state persistence** (transpose, scroll, orientation) keyed `${type}:${id}` in `localStorage`.
6. **Transpose UI** for `chords` items (re-render via `engine.renderA4Html({ key })`).
7. **`useBlobUrl(id)`** hook extracted from `BlobSlide` and reused by future surfaces (today's logic is inlined and not reusable).
8. **Editor Play wiring** with flush — setlist, collection, song.
9. **A11y / keyboard / touch** navigation (arrows, PgUp/PgDn, Home/End; touch swipe between items; focus return on close).
10. **Prefetch next item** when online (per [grill](./grill-session.md#resilience-ops-and-edge-cases)).
11. **Eviction-during-playback grace** and **server-deleted reconciliation** banner.
12. **Header polish** — TOC button, scroll/orientation controls, item counter, online/offline indicator, transpose chip; no app shell, "balanced" contrast (BR6).

---

## 2. Routing and entry points

1. **Route** `/player` stays the same (no path change).
2. **Search params:** keep `{ type: 'song' | 'setlist' | 'collection'; id: string }` from `app/src/routes/player.tsx`. **No new params** in v1 — view state lives in `localStorage`, not the URL. Rationale: short shareable links + per-user defaults; future "share with view state" can opt into URL params behind a follow-up flag.
3. **`return_to` allowlist:** **`/player` IS allowlisted** for post-login `return_to` (same-origin app path). Deep-linking into the player after login is supported. Editor routes (`/songs/:id`, `/setlists/:id`, `/collections/:id`) remain **not** allowlisted ([E7.1 §1.3](./epic-e7.1-action-plan.md#1-routing-and-deep-links)).
4. **Editor entry points** — each editor adds a Play control. The control:
   - For **setlist** and **collection**: **flushes** any pending debounced PATCH (calls the autosave coordinator's `flushNow()` from [E7.1 §2.1](./epic-e7.1-action-plan.md#21-autosave-coordinator-useautosave-or-equivalent)), waits for the in-flight PATCH to resolve, **then** navigates. On PATCH failure, **do not navigate** — surface the autosave error state and let the user Retry or Discard before Play.
   - For **song**: same flush rule, plus the **strict parse gate** from [song-editor.md](./song-editor.md#wasm--chordlib) (block save and therefore block Play on parse errors).
   - **Read-only library:** Play remains available even without write access (no flush needed because no edits can be pending).
5. **Hub list primary tap** + **long-press Play** stay as wired in E2/E7.1.

---

## 3. Player chrome and layout

The player owns its own chrome. No `AppShell` wrap; no bottom tab bar; no `+` FAB.

### 3.1 Header (sticky top)

| Slot | Content | Notes |
|------|---------|-------|
| **Left** | **Back** button → hub list for `type` (`/collections` / `/songs` / `/setlists`) | Same component as E4's existing back link; preserves the "scroll list to top on return" rule from [pages-and-flows.md](./pages-and-flows.md) (which already matches E7.1 §5 invalidation behavior). |
| **Center (truncated)** | **Resource title** (best available: `Setlist.title` / `Collection.title` / `Song.data.titles[0]` fallback) + **item counter** "K / N" | Title is best-effort; if the `Player` payload does not carry the resource title at the top level today, fetch the detail in parallel and fill in once available (do not block initial render on it). |
| **Right** | **TOC button** (opens drawer §4), **Scroll-mode menu** (§5), **Orientation toggle** (§5), **Transpose chip** for `chords` items (§6), **Online / Offline indicator** near the right edge per [architecture.md](./architecture.md#mechanics) | All actions are icon buttons with `aria-label` translated EN + DE. |

**Chrome contrast:** "balanced — readable, not harsh" (BR6). Use the same surface tokens as the rest of the app (`--color-surface`, `--color-foreground`) — **do not** invert blob content; chrome dark mode applies to the header/footer only ([architecture.md Platform capability gates](./architecture.md#platform-capability-gates-illustrative)).

### 3.2 Footer (sticky bottom)

| Slot | Content |
|------|---------|
| **Left** | **Prev** button (disabled at start) |
| **Center** | **Item nr / title** (from `TocItem.nr` + `TocItem.title` matching `index`) — small text, single-line ellipsis |
| **Right** | **Next** button (disabled at end) |

Footer respects `pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]` (already in `PlayerRoute.tsx`).

### 3.3 Body (between header + footer)

- One `PlayerItemSlide` at a time (current model).
- Body fills `min-h-0 flex-1`; the `ChordsSlide` viewport observer (`ResizeObserver` in `ChordsSlide.tsx`) keeps the A4 page scaled to the available height per `viewportScaleForA4`.
- Blob items render image or PDF embed per current logic; PDF embed continues to use the browser's native PDF viewer in v1 (no `pdf.js`).
- **Eviction during playback** (offline + setlist evicted while open in another tab): allow the **current** item to finish (do not revoke its object URL); Prev/Next is **disabled** until the user is back online or opens cached content. Implement via a global "evicted" event on the Dexie mirror table — listening hook subscribes in `PlayerBook`.

### 3.4 Empty / error / offline-unavailable

Existing branches stay (loading, error, `offline_unavailable`, empty `items`). Add:

- **Server-deleted reconciliation:** when an online refetch returns 404 for a setlist we have cached locally, surface a one-time toast/banner ("This setlist was removed by the team") and **clear** the local mirror per [architecture.md](./architecture.md#mechanics).
- **WASM load failure** on `chords` items: existing `ChordsSlide` retry stays; ensure the retry refires `engine.renderA4Html` (it does) and does not regress the resource-level resolver.

---

## 4. TOC drawer

1. **Drawer pattern:** **bottom drawer** on phone (same Radix `Dialog` + Framer Motion sheet pattern as `CreateTeamDialog` / `SetlistSongPickerSheet`); **right-anchored sheet** at `≥ md` so the drawer does not cover the page on tablet/desktop. Same component, breakpoint-conditional anchor.
2. **Open:** TOC button in the header (§3.1) and **keyboard shortcut `t`** (or `T`) when no input/textarea is focused.
3. **Rows:** one entry per `TocItem`, rendering:
   - **`nr`** label as a chip on the left (e.g. "1.", "A", "Bridge").
   - **`title`** as the row label.
   - **Active row** (`idx === current index`) visually distinguished (border accent + `aria-current="true"`).
   - **`liked`** flag rendered as a heart icon (read-only — likes still mutate from lists per [song-editor.md A8](./song-editor.md#play-navigation)).
4. **Tap / Enter:** sets the player `index` to `TocItem.idx` and closes the drawer. Focus returns to the body of the new item.
5. **`TocItem.id` is informational** — do **not** use it for routing within the player; the player operates on `index` only.
6. **Empty TOC:** if `toc` is empty (degenerate single-song player), hide the TOC button entirely.

---

## 5. Scroll modes and orientation

This is where E8 graduates the player from "prev/next slot" to **book mode**.

### 5.1 `ScrollType` semantics

| Value | Render |
|-------|--------|
| `one_page` | One page at a time (current behavior). Prev/Next moves item by item. |
| `half_page` | Page split horizontally; Prev/Next advances by **half a page** within an item, crossing to the next item when the current item ends (subject to `between_items`, §5.3). |
| `two_page` | Two pages side by side (e.g. a spread). Tablet/desktop only — collapse to `one_page` automatically on phone widths (`< md`). |
| `book` | Book navigation: Prev/Next moves **page-shaped chunks** within the active item, then jumps to the adjacent item. |
| `two_half_page` | Variant of `book` with two half-pages visible. Tablet/desktop only; collapse to `half_page` on phone. |

Implementation note: on phone widths, force `two_page → one_page` and `two_half_page → half_page` at render time **without** mutating the persisted preference — when the user later opens the player on a tablet the original choice comes back.

### 5.2 Orientation

`Orientation` is `portrait | landscape`. On the **web** shell we cannot change device orientation; we **lay out** the page accordingly:

- `portrait` (default): A4 1 : √2 vertical (same as today).
- `landscape`: A4 √2 : 1 horizontal; `two_page` / `two_half_page` naturally fits.

### 5.3 `between_items`

Boolean from the `Player` payload.

- `true` (default in most setlists): prev/next at item boundaries **always** crosses the boundary (one keystroke = one item).
- `false`: prev/next first exhausts intra-item pages (in `book` / `half_page` / `two_*` modes) before crossing the boundary. In `one_page` mode the flag is effectively a no-op.

### 5.4 `scroll_type_cache_other_orientation`

Server-provided cache for the **other** orientation's scroll type. When the user toggles orientation:

1. Save the current `scroll_type` into the cache slot for the **outgoing** orientation.
2. Restore `scroll_type` from the cache for the **incoming** orientation (or the server-provided default if none).

In practice the player owns two `scroll_type` slots (one per orientation) plus the active orientation; toggle swaps them in O(1).

### 5.5 UI surface (header controls)

- **Orientation toggle:** single icon button cycling portrait ↔ landscape.
- **Scroll-mode menu:** dropdown anchored to header right; options filtered for the active orientation + viewport breakpoint (see §5.1 collapse rules).
- Both controls write into the per-resource view-state slice (§7) and trigger a re-layout immediately — no fetch.

---

## 6. Per-item rendering

### 6.1 `chords` items

- Continue rendering via `ChordsSlide` → `getChordEngine().renderA4Html(songData, { key, scale })`.
- **Transpose:** Add a **transpose chip** in the header that opens a popover with the 12 keys + **Default** (back to `song.data` default / per-slot `SongLink.key`). Choosing a key writes to the per-resource view state (§7) and re-renders. The chip label shows the active key (default highlighted distinctly from pinned, matching the setlist editor chip behavior in [setlist-editor.md](./setlist-editor.md#data-loading)).
- **Initial key resolution** (per item, in this priority order, mirroring `resolveSongDataKey`):
  1. Local override from view state (user-set transpose).
  2. **Setlist context only:** `SongLink.key` from the matching slot when `type === 'setlist'`.
  3. `song.data.default_key` (or whatever the song schema exposes — see `resolveSongDataKey` in `setlist-song-links.ts`).
  4. No override (chordlib renders the song as authored).
- **Chord format preference** (letters / Nashville) continues to come from `useChordFormatPreference`; surface the toggle in the header **only** when at least one `chords` item is in the current `Player.items` (avoid showing controls that do nothing for blob-only sheets).
- **WASM gate:** if `getChordEngine()` rejects, show the existing `ChordsSlide` error state with **Retry** (already present). **Block** the whole player when the failure repeats and the user navigates to another `chords` item (do not silently swallow); the existing `renderState === 'error'` branch already covers this — verify behavior in tests.

### 6.2 `blob` items

- Replace inlined fetch logic in `BlobSlide` with a new **`useBlobUrl(id, { allowNetworkFetch })`** hook (port from [api-integration.md](./api-integration.md#blob-urls)):
  - Returns `{ url, mime, status: 'loading' | 'ready' | 'error' | 'offline-unavailable', retry }`.
  - Reads Dexie via `getCachedBlob`; falls back to `fetchBlobBinaryWithMime` when online.
  - Owns the `URL.createObjectURL` / `URL.revokeObjectURL` lifecycle on unmount.
  - **Large blob progress:** indeterminate progress + cancel (per [grill](./grill-session.md#resilience-ops-and-edge-cases) — match the api-integration "Large blobs" rule). Wire `AbortController` through the hook so cancel actually aborts the fetch.
  - **No multi-retry loop** — manual `retry()` only.
- **PDF rendering:** keep the `<embed>` path; do **not** introduce `pdf.js` in v1. Document this in `pages-and-flows.md` so it stays consistent.
- **Dark mode + scans:** keep the white-page background already on `.player-chords-page`; mirror that rule for blob containers (`.player-blob-page` or similar) so a scan never picks up the dark surface color behind it.

### 6.3 Prefetch next item (online only)

- When online **and** the current player has more than one item, prefetch the **next** item's resource:
  - `blob` next item: prefetch the blob bytes via the same Dexie-aware path used for the active item.
  - `chords` next item: no network prefetch needed (the song payload is already inline in `Player.items[next].song`), but **pre-warm** the chord engine render by calling `engine.renderA4Html` for that item once and discarding the output (or cache `{ html, css }` keyed by `(songId, key, scale-bucket)` for instant swap-in).
- Cancel prefetches on `index` change (use `AbortController`).
- **Offline:** **no** prefetch (per [grill](./grill-session.md#resilience-ops-and-edge-cases) — "Prefetch next item only when online").

---

## 7. Per-resource view-state persistence

Per [grill 2026-04-21 — Player UI state](./grill-session.md#auth-player-rendering-permissions): persist transpose, scroll mode, orientation, and chord-format preference **locally** scoped to the playing resource.

1. **Storage:** `localStorage` (Zustand persist slice or a small `playerViewState` module — single decision in the implementing PR; recommend reusing whichever pattern the app already settled on for per-entity view-mode toggles, e.g. `hub-view-mode.ts`).
2. **Key shape:** `playerView:{type}:{id}` — JSON blob `{ scrollType, orientation, transposeByItem: Record<itemIndex, keyOrNull>, scrollTypeCacheOtherOrientation }`. **Per-item transpose** because a setlist or collection contains multiple chord items, each with its own preferred key.
3. **Migration:** none in v1. First read returns server defaults from the `Player` payload; subsequent reads merge over them.
4. **Size cap:** view state is tiny (kilobytes at most); no eviction needed in v1. Tracked under [E4 Settings → Clear cache](./architecture.md#mechanics) implicitly — **clearing offline cache also wipes player view state for that resource** (Dexie wipe path stays the source of truth on logout/401).
5. **No cross-tab sync** — last-write-wins via `localStorage` (browsers fire `storage` events; we ignore them in v1 for simplicity, same as E7.1 multi-tab posture).

---

## 8. Keyboard, touch, and a11y

### 8.1 Keyboard

- **Arrow Left / PageUp:** Prev.
- **Arrow Right / PageDown / Space:** Next.
- **Home:** first item.
- **End:** last item.
- **`t`:** toggle TOC drawer (when no input/textarea focused).
- **`o`:** toggle orientation.
- **`s`:** open scroll-mode menu (focus first option).
- **Esc:** if TOC drawer or a popover is open, close it; otherwise back to hub.
- All shortcuts are **disabled** when a focused element is `input`, `textarea`, or `[contenteditable="true"]` (e.g. transpose key picker open).

### 8.2 Touch

- **Horizontal swipe:** Prev/Next between items (respect `between_items` for intra-item paging in `book` modes — within an item, swipe pages within the item before crossing).
- **Vertical swipe:** scroll the current item normally (do not hijack).
- **Long-press:** **no action** in v1 (no in-player context menu — out of scope).

### 8.3 A11y

- Player body has `role="main"` with `aria-label` translated ("Player — {resourceTitle}").
- Item transitions announce via `aria-live="polite"` ("Item K of N — {title}").
- TOC drawer traps focus while open; `Esc` closes; focus returns to the TOC trigger.
- Footer Prev/Next have `aria-keyshortcuts` ("ArrowLeft" / "ArrowRight").
- Transpose / orientation / scroll-mode buttons have `aria-label` carrying the **current** value (e.g. "Transpose: G, change") so screen readers announce state, not just affordance.
- **Reduced motion:** when `prefers-reduced-motion: reduce`, suppress swipe animations and drawer slide easing (use instant transitions).

---

## 9. Offline integration (verify, do not re-architect)

E4 already shipped the **setlist** Dexie mirror. E8 verifies the player end-to-end against the offline rules from [architecture.md](./architecture.md#offline-strategy-mvp) and only **adds** the rules below.

1. **`touchSetlistPlayerOpened`** — already wired in `loadOfflineSetlistPlayer`. Confirm `lastOpenedAt` is bumped **only on player open** (not editor) — already true.
2. **Eviction-during-playback grace** — implement a global Dexie event (or query) the open player listens to:
   - If our `setlistId` is evicted while open: **keep** the current item visible (its object URL still valid for that lifetime); set an internal `evicted: true` flag.
   - **Prev / Next** become disabled with a tooltip / aria-live "This setlist is no longer cached".
   - On reconnect, the next online resolver pass auto-recovers (`resolvePlayerForRoute` re-fetches).
3. **Server-deleted reconciliation** — when `fetchSetlistPlayerFromNetwork` returns 404 and a local mirror exists, **clear** the mirror (`evictOneSetlistMirror`) and surface a toast in the player ("This setlist was removed by the team — playing local cache for the last time" if we are still online; or banner if we are switching from offline). One-shot — do not re-show on subsequent opens after clear.
4. **Song / collection** players stay **online-only** in MVP. No work here.
5. **Online indicator** in player header is the same indicator the app shell uses elsewhere — share the existing hook (`use-online.ts`).

---

## 10. Editor Play wiring

The flush-before-Play rule is **normative** but unwired in E7.1–E7.3 (per their own out-of-scope sections). E8 lands the wiring.

### 10.1 Setlist editor

1. Render a **Play** button in the editor header (visible on **all** breakpoints; placement aligns with the save-state icon area without crowding it).
2. **On click:**
   1. Call the autosave coordinator's `flushNow()` (synchronous start; returns a Promise).
   2. If `flushNow()` resolves **success**: `navigate({ to: '/player', search: { type: 'setlist', id } })`.
   3. If `flushNow()` resolves **failure**: do **not** navigate; the editor's §2.5 error state already surfaces Retry / Discard ([E7.1](./epic-e7.1-action-plan.md#25-error-recovery--block-until-retry-or-discard)). The Play button is **disabled** while the error state holds (matches the "block input" semantics).
   4. If a PATCH is **already in flight**, the Play button is disabled until it resolves (same as all editor affordances per [E7.1 §2.1](./epic-e7.1-action-plan.md#21-autosave-coordinator-useautosave-or-equivalent)).
3. **Empty setlist** (`songs.length === 0`): Play button is disabled with `aria-label="Add songs before playing"` (no toast; visible state is enough).
4. **Read-only setlist** (no write access): Play remains **enabled** (no edits to flush; navigate immediately).
5. **Broken rows** ([E7.1 §4.5](./epic-e7.1-action-plan.md#4-setlist-editor-screen-setlistsid)): Play is **disabled** while broken rows are present (same gate as autosave; the player would render unavailable items anyway).
6. The flush-before-Play rule in [setlist-editor.md §Play and navigation](./setlist-editor.md#play-and-navigation) is now **implemented** — remove the "E7.1 deferral" wording from that doc in the same epic.

### 10.2 Collection editor

Same contract as setlist (the editors share the autosave model per [E7.2](./epic-e7.2-action-plan.md)). Play navigates to `/player?type=collection&id=…`.

### 10.3 Song editor

Per [song-editor.md](./song-editor.md#play-navigation):

1. Render a **Play** affordance in the editor's overflow menu (⋯) **and** as a primary action when space allows; placement matches [song-editor.md](./song-editor.md) wording ("editor chrome").
2. **On click:**
   1. **Strict parse** check (already gated for save per [song-editor.md B1](./grill-session.md#song-editor-grill-2026-04-20)). If parse fails, show inline errors and **do not navigate**.
   2. Call `flushNow()` on the song autosave coordinator (per [song-editor.md](./song-editor.md#saves-and-conflicts)).
   3. On success: `navigate({ to: '/player', search: { type: 'song', id } })`.
   4. On failure: same posture as setlist — keep user in the editor with the error state visible.
3. **Read-only / `not_a_song`:** Play remains available (no edits to flush). For `not_a_song` the player simply renders whatever the server returns from `/player`; that is the server's contract, not ours.

### 10.4 Hub list (already done in E2/E7.1)

No changes; Play from long-press and primary tap stays as is.

---

## 11. TanStack Query

1. **Query key** for player payloads: `['player', type, id]` (already in `PlayerRouteInner`). Keep stable so future invalidation works.
2. **No `setQueryData` after editor PATCH** invalidates the player cache directly — let the player refetch naturally on next open. Rationale: the editor and player live on different routes; the user nearly always saves → leaves → opens player, and the player route mounts fresh.
3. **`useBlobUrl`** is **not** a TanStack Query — it owns lifecycle (object URLs) that doesn't fit Query's serialization model. Internal `useState` + `useEffect` with `AbortController` is the right shape.
4. **Player prefetch:** call `queryClient.prefetchQuery(['player', nextType, nextId])` only when (a) we are online and (b) `type === 'collection'` or `type === 'setlist'` and there is a documented "next playable resource" pattern. For v1, **inter-resource** prefetch is **out of scope** — prefetch lives **within** the current player only (§6.3).

---

## 12. Tests

**Unit tests are required for E8 exit; component / E2E coverage is optional.**

### 12.1 Required (Vitest, pure functions and hooks with stubs)

1. **`useBlobUrl` hook** — Testing Library `renderHook`: blob from network sets `objectUrl`, unmount revokes; Dexie cache hit short-circuits the network call; offline + no cache yields `offline-unavailable`; `retry()` re-runs the resolver; abort on unmount.
2. **Per-resource view-state slice** — given a key `(type, id)`, set/get transpose/scrollType/orientation; orientation toggle round-trips `scrollTypeCacheOtherOrientation`; localStorage key stable across reloads (smoke a mock storage).
3. **Keyboard map** — given a focused element (input vs `body`), the keymap dispatches only when not in an input/textarea/contenteditable. Pure-function dispatcher tested directly.
4. **TOC reducer** — given a `Player` and a target `idx`, advance the active item; `Home` / `End` clamp; `Prev`/`Next` respect `between_items` in `book` mode (i.e. intra-item paging counters increment before item boundary). Pure function `nextPlayerState(state, action)`.
5. **Prefetch decision** — given `{ online, currentIndex, totalItems }`, returns the correct prefetch target index or `null`; never prefetches when offline.
6. **Editor Play flush** — for setlist + song coordinators (stub `flushNow`), Play resolves: success path navigates (mock `navigate`), failure path does not.
7. **Server-deleted reconciliation** — given a 404 resolver result and an existing Dexie mirror, the reconciler calls `evictOneSetlistMirror` once and emits the toast event (mock event bus).

### 12.2 Optional (component tests with Testing Library)

1. **`PlayerBook` render** — given a `Player` with mixed `blob` + `chords` items, prev/next walk all items; TOC drawer entries match `Player.toc`.
2. **WASM failure UI** — mock `getChordEngine` rejection → error block + Retry; Retry triggers a fresh render.
3. **Read-only editor + Play** — setlist editor in read-only mode still renders an enabled Play.

### 12.3 Not in scope

Playwright / E2E smoke for E8 — full E2E + minimal SW sanity is **E10** ([roadmap §E10](./roadmap.md#e10--production-polish)).

---

## 13. Documentation (this phase)

Promote E8 decisions into normative docs **in the same PR / epic** so docs and code do not drift:

1. **[pages-and-flows.md](./pages-and-flows.md):**
   - Replace "Book mode; **query** `type` … and `id`" with the full E8 model: TOC drawer, scroll modes, orientation, transpose persistence, prefetch-next-online.
   - Remove the "E2 originally shipped silent no-op taps" historical note (E8 means the loop is closed; keep only the current behavior).
   - Update **List → editor → player** step 2 to reflect that **all three** editors now offer Play (setlist + collection + song).
2. **[setlist-editor.md](./setlist-editor.md):** Strike the "E7.1 deferral: the editor ships without a Play affordance" lines; the flush-before-Play rule becomes the current behavior, not a target.
3. **[song-editor.md](./song-editor.md):** Confirm the `flush → navigate` rule in §Play navigation matches the implemented Play affordance; add the parse-gate clarification if it isn't already worded that way.
4. **[architecture.md](./architecture.md):** Add a paragraph to **Offline strategy — Mechanics** describing the **eviction-during-playback grace** + **server-deleted reconciliation** flows that E8 implements (the rules are already documented; cite the implementation hooks: `evictOneSetlistMirror`, `touchSetlistPlayerOpened`).
5. **[app-shell.md](./app-shell.md):** No change required — the "Player route (`/player`, no shell)" rule already exists; confirm wording matches the implemented chrome (TOC + controls live **inside** the player, not the app shell).
6. **[roadmap.md](./roadmap.md):** Tick E8 exit bullets when complete; **no** new release-cut row (the "Rehearsal-ready" cut already covers E8).
7. **[grill-session.md](./grill-session.md):** Add an **E8 interactive grill** subsection capturing any decisions made during implementation that weren't pre-locked in earlier grills (e.g. exact keyboard shortcuts, drawer anchor breakpoint, swipe gesture priority).

---

## 14. Exit checklist (manual)

Walk through these on a fresh build (one phone, one tablet/iPad with keyboard, one desktop). Each row must pass before E8 is done.

### 14.1 Plumbing

1. **`/player?type=setlist&id=…`** loads online; payload arrives; renders item 1 of N with TOC, header controls, footer Prev/Next.
2. **`/player?type=song&id=…`** and **`?type=collection&id=…`** load online identically (modulo offline-unavailable rules below).
3. **Logged-out deep link to `/player?type=setlist&id=…`** redirects to `/login`, then **lands back in the player** post-auth (returnTo allowlist).
4. **`useBlobUrl`** is the single source of blob lifecycle; no inlined `URL.createObjectURL` left in `PlayerRoute.tsx`. Object URLs revoke on unmount and on `id` change (no leaks under repeated Prev/Next).

### 14.2 Book-mode behavior

5. **TOC drawer:** opens via header button and `t` shortcut; rows match `Player.toc`; tapping a row jumps to that `idx` and closes the drawer; active row marked `aria-current`.
6. **Scroll modes:** all five `ScrollType` options usable on appropriate breakpoints; `two_page` / `two_half_page` auto-collapse on phone widths without mutating saved preference; **`between_items`** semantics observable in `book` (intra-item paging before item boundary when `false`, immediate jump when `true`).
7. **Orientation:** toggle round-trips `scroll_type_cache_other_orientation` (toggle portrait → landscape → portrait restores the original `scroll_type`).
8. **Transpose chip** (chords items only): popover offers 12 keys + Default; choosing rerenders the page; reopening the player after reload restores the chosen key for that item.
9. **Chord-format toggle** (letters / Nashville) appears only when at least one `chords` item exists; persists across reloads.

### 14.3 Editor Play

10. **Setlist Play:** typing then Play flushes the pending PATCH (visible save-state icon → spinner → success), then navigates. PATCH-failure path keeps the user in the editor with the §2.5 error state.
11. **Collection Play:** same as setlist.
12. **Song Play:** parse-failure path **blocks** navigation and surfaces inline parse errors; clean parse + flush → navigate. Read-only song still allows Play.
13. **Empty setlist Play:** button disabled with the right `aria-label`; not a toast.
14. **Read-only setlist Play:** enabled, navigates immediately (no flush).

### 14.4 Offline + a11y + edge cases

15. **Offline indicator** in player header matches app shell behavior — online/offline events flip instantly (no debounce).
16. **Setlist offline:** open cached setlist → plays; uncached setlist → `offline_unavailable` with Back. Song / collection offline → `offline_unavailable`.
17. **Eviction grace:** with two tabs open on the same setlist, eviction triggered by the second tab does **not** unmount the first tab's current item; first tab's Prev / Next become disabled with the eviction message.
18. **Server-delete reconciliation:** delete a cached setlist server-side; next online open shows the toast, the local mirror is cleared, subsequent opens show `offline_unavailable` when offline.
19. **WASM failure:** force a chord engine import failure (mock or break the URL); the chord slide shows the error + Retry; recovery brings the player back without a full reload.
20. **Keyboard nav:** ← / → / PgUp / PgDn / Space / Home / End / `t` / `o` / `s` / Esc all behave per §8.1; ignored when an input is focused.
21. **Touch:** horizontal swipe advances items (respecting `between_items`); vertical swipe scrolls normally; no accidental item changes while scrolling lyrics.
22. **A11y announcements:** item transition is announced via `aria-live`; TOC drawer traps focus; reduced-motion disables drawer slide easing.

### 14.5 i18n + docs

23. **EN + DE** strings shipped for every new label introduced by E8 (TOC button, scroll-mode menu, orientation toggle, transpose chip popover, Play affordance copy, error banners, eviction message).
24. Docs in §13 merged in the same PR / epic — no contradiction between code and `pages-and-flows.md` / `setlist-editor.md` / `song-editor.md`.
25. **Required Vitest suites** (see [§12](#12-tests)) green in CI.

When all rows pass, **E8 is complete** — proceed to [E9 — Sync transport and Tauri readiness](./roadmap.md#e9--sync-transport-and-tauri-readiness).

---

## 15. Suggested commit / PR slicing

To keep review manageable, split the implementation along seams that compile and ship in isolation:

1. **PR-1 — `useBlobUrl` hook + inline replacement.** Pure refactor of `BlobSlide`; no UX change. Adds the required `useBlobUrl` Vitest suite.
2. **PR-2 — Per-resource view-state slice + `nextPlayerState` reducer.** Pure logic + storage; not yet wired to UI. Adds reducer + view-state tests.
3. **PR-3 — TOC drawer.** Reads `Player.toc`; dispatches `jumpTo(idx)` through the reducer. Keyboard `t` shortcut.
4. **PR-4 — Scroll modes + orientation + `between_items`.** Wires reducer to layout; adds header controls; respects breakpoint collapse rules.
5. **PR-5 — Transpose UI for chord items + chord-format toggle surfacing.** Per-item transpose; persisted via view-state slice.
6. **PR-6 — Prefetch next item (online only).** AbortController-scoped.
7. **PR-7 — Editor Play wiring (setlist + collection + song).** Includes the `flushNow → navigate` contract, parse-gate for song, and removes the E7.1 / E7.2 / E7.3 "deferred" wording from docs.
8. **PR-8 — Eviction grace + server-delete reconciliation + i18n EN/DE + final docs.** Locks in [§13](#13-documentation-this-phase) doc updates and the manual exit checklist.

Each PR keeps the player demoable; PR-7 is the moment the **full E8 loop** ("Rehearsal-ready" release cut, [roadmap.md](./roadmap.md#suggested-release-cuts-optional)) goes live.

---

## Related docs

- [Roadmap](./roadmap.md)
- [Architecture](./architecture.md)
- [Pages and flows](./pages-and-flows.md)
- [App shell](./app-shell.md)
- [Setlist editor](./setlist-editor.md)
- [Song editor](./song-editor.md)
- [API integration](./api-integration.md)
- [Epic E7 phase index](./epic-e7-action-plan.md) · [E7.1](./epic-e7.1-action-plan.md) · [E7.2](./epic-e7.2-action-plan.md) · [E7.3](./epic-e7.3-action-plan.md)
- [Design grill session](./grill-session.md)
