# Epic E7.1 — Setlist editor (no WASM)

**Parent:** [E7 — Content editors](./roadmap.md#e7--content-editors-collections-songs-setlists) · [E7 phase index](./epic-e7-action-plan.md)

**Skipping E6:** [§0 — scope adjustments](./epic-e7-action-plan.md#0-skipping-e6--scope-adjustments) (export/import deferred until E6).

**Prerequisites:** E1–E5 per [roadmap](./roadmap.md).

**Normative UX:** [setlist-editor.md](./setlist-editor.md), [pages-and-flows.md](./pages-and-flows.md), [api-integration.md](./api-integration.md), [architecture.md](./architecture.md), [openapi.json](./openapi.json).

**Next:** [Epic E7.2 — Collection editor](./epic-e7.2-action-plan.md)

---

## Outcome

Users can **create and edit setlists** (title, reorder, add/remove songs, per-slot key) per [setlist-editor.md](./setlist-editor.md). **No** song or collection detail editors yet. **No Play affordance in the editor this phase** — Play wires up with **E8** (the editor's flush-before-Play rule in [setlist-editor.md](./setlist-editor.md) remains normative for E8 but is not implemented now).

E7.1 is an **internal milestone** toward E7; **no** new "Suggested release cut" row in [roadmap.md](./roadmap.md). The E7 release cut still requires E7.1–E7.3.

## Exit (E7.1)

- Route **`/setlists/:id`** with app shell; on **`/setlists`**, **primary tap / Enter / Space** opens **`/player`** for that setlist (same as Collections / Songs hubs); **Edit** is reachable via **long-press / context menu** (and create/deep links). **No Play affordance inside the editor** in E7.1 — see §4.10.
- **Create flow** on **`/setlists`**: **`+`** → **`CreateSetlistDialog`** (bottom-drawer, mirrors **`CreateTeamDialog`** from E5) → on **Create**: **`POST /api/v1/setlists`** → navigate to **`/setlists/{id}`** (same editor screen as edit). The `+` button itself never POSTs; the dialog gathers required fields first. See [§3](#3-hub-integration-setlists-only) for full flow.
- Setlist editor behavior matches **setlist-editor.md** **except** Play wiring (PATCH, debounce, flush on route leave, optimistic reorder, a11y moves, picker, Cmd-K insert, read-only/offline rules).
- **i18n:** EN + DE for all **setlist editor** strings (copy text is implementer's discretion subject to brand voice; new keys live under a `setlists.editor.*` / `setlists.create.*` namespace; reuse existing namespaces like `teams.dialogCancel` only when the meaning is identical).
- **No** `ChordEngine` / chordlib in this phase.

---

## 0. Out of scope (explicit)

The following are **deliberately not** in E7.1. They are listed here so reviewers don't expect them and so an implementer can push back if scope drifts:

| Topic | Where it belongs |
|-------|------------------|
| **Play affordance in the editor** (button + flush-before-Play) | **E8** — see [§4.10](#4-setlist-editor-screen-setlistsid) |
| **Song detail editing** (lyrics, ChordPro, key, tempo, etc.) | **E7.3** |
| **Collection editing** | **E7.2** |
| **Blob management** (sheet music files) | **E7.3** / later |
| **`ChordEngine`** + chordlib WASM | **E7.3** |
| **Multi-add picker** (selecting N songs in one open) | post-MVP follow-up |
| **Recent / Liked tabs** in the picker | post-MVP follow-up |
| **IndexedDB outbox** / local drafts / offline queueing of edits | **E4**-territory; explicitly not introduced here |
| **`BroadcastChannel` / cross-tab edit sync** | not in v1 — see [§2.8](#28-multi-tab--cross-tab-conflicts) |
| **`If-Match` / ETag conflict UX** | not in v1 — last-write-wins per [setlist-editor.md](./setlist-editor.md) |
| **Per-resource permission flag** consumed from API | API gap — [§2.4.5](#24-permissions-and-read-only) |
| **Move setlist to another team** from inside the editor | list-only, [§4.11](#4-setlist-editor-screen-setlistsid) |
| **Delete setlist** from inside the editor | list-only, [§4.11](#4-setlist-editor-screen-setlistsid) |
| **Export rows** (PDF / ChordPro / WorshipPro) | **E6** — see [E7 §0](./epic-e7-action-plan.md#0-skipping-e6--scope-adjustments) |
| **Import** entry on `+` | **E6** — same |

---

## 1. Routing and deep links

1. Add authenticated route **`/setlists/:id`** with the **normal app shell** (not the bare `/player` route from E8).
2. **Deep-linkable** while signed in; works after PWA reload ([pages-and-flows.md](./pages-and-flows.md)).
3. **`return_to` allowlist:** **`/setlists/:id` is NOT an allowlisted post-login destination.** A logged-out deep link into the editor **bounces to `/setlists`** after successful auth (no in-flight edit can survive the login redirect anyway). Other editor URLs follow the same rule unless their phase explicitly opts in. The same-origin allowlist from **E1** still governs which paths may appear in `return_to`.

---

## 2. Shared editor building blocks (setlist-sized)

Introduce patterns **E7.2** (collection) and **E7.3** (song) will extend. Numbers below (debounce ms, save-indicator semantics, in-flight policy) are **normative for E7.1** and **default for E7.2 / E7.3** unless those phases re-grill.

### 2.1 Autosave coordinator (**`useAutosave`** or equivalent)

1. **Debounce:** **single 750 ms window** for all dirty top-level fields (`title`, `songs`). Edits within the window reset the timer.
2. **Flush triggers** (cancel debounce, fire PATCH **immediately**):
   - Router navigation away from **`/setlists/:id`** (any direction).
   - **`document.visibilityState === 'hidden'`** (tab hidden / minimized).
   - **`pagehide`** and **`beforeunload`** (best-effort; payload should fit in `keepalive: true` `fetch` — `PATCH` body is small).
   - Before **opening the song picker** or **invoking Cmd-K insert** (so the next "add song" PATCH starts from a clean baseline).
3. **In-flight policy — `block_input`:** **While a PATCH is in flight, all editing affordances are disabled** — title input is read-only with a brief lock indicator, drag-reorder is denied, keyboard move-up/down no-ops with a polite `aria-live` announcement, picker **Add** is gated until the in-flight PATCH resolves (the picker may stay open and search may be typed; only the **Add** action waits). Justification: combined with **last-write-wins** and **field-diff** payloads (§2.4), serial PATCHes prevent ambiguous interleaving without an `If-Match` workflow. Risk acknowledged: on slow networks this introduces user-visible latency; the save-state icon (§2.3) and the 750 ms debounce keep the perceived blocking window small.
4. **Coalescing:** New edits arriving during a flight do **not** start a parallel PATCH. They re-enter the debounce window after the flight resolves. **Queue depth is 1** (any number of edits coalesce into a single follow-up PATCH).
5. **Conflicts (MVP):** **Last successful PATCH wins** — no `If-Match` / ETag client workflow. Cross-tab risk acknowledged ([setlist-editor.md](./setlist-editor.md) §Mutations).

### 2.2 PATCH payload — field-diff per window

1. Each PATCH body contains **only the top-level fields that changed** within that debounce window — e.g. `{ "title": "…" }` for title-only edits, `{ "songs": [ … ] }` for reorder/add/remove, `{ "title": "…", "songs": [ … ] }` when both moved.
2. Empty diffs **do not fire a PATCH** (debounce timer fires, finds nothing dirty, exits silently).
3. **`SongLink[]`** in `songs` is **always the full array** when `songs` is dirty (the array IS the field value — there is no per-row diff).
4. Diff scope is **top-level fields** of the setlist resource only; in E7.2 we revisit whether `cover` warrants the same treatment.

### 2.3 Save-state indicator — icon-only with `aria-live`

1. A **single small icon** near the editor title communicates the autosave state. **States:**
   - **idle** — no icon (or a static neutral mark): clean, no pending edits.
   - **pending** — appears the moment a debounced edit is registered; clears when the PATCH resolves or coalesces. (May be a small dot — distinct from spinner.)
   - **saving** — spinner; replaces pending the moment a PATCH starts in flight. Editing is blocked (§2.1).
   - **error** — warning icon; persistent until the user **Retry**s or **Discard**s the failed change (see §2.5).
2. **Accessibility:** the icon's wrapper has `role="status"` with **`aria-live="polite"`** carrying the localized state string (`Saving…`, `Saved`, `Save failed — retry`). Screen readers announce transitions; the visible icon is decorative (`aria-hidden="true"`).
3. **No `Saved at HH:MM` text in v1** — keep the surface minimal; if collection/song editors need richer status in E7.2/E7.3 they may extend.

### 2.4 Permissions and read-only

1. **Capability source of truth (E7.1):** **infer from team membership** — the user can edit a setlist iff they have **library-edit** role on the setlist's owner team. Reuse the same writeable-team predicate that powers the team picker in the create dialog (§3.3.2); extract it into a single helper (e.g. `useCanEditSetlist(setlist)`) consumed by both the editor and any future per-row affordances.
2. **No defensive 403 fallback in E7.1.** If the inferred check is wrong and the API returns **403** on PATCH, the failure surfaces via the §2.5 error state like any other 5xx; we do **not** auto-flip the editor into read-only mid-session in v1. Add a follow-up if 403 starts happening in practice.
3. **Read-only editor:** title input is `readOnly`, drag handles hidden, keyboard sensor disabled, picker / Cmd-K insert disabled, swipe-to-remove disabled. **Single banner** at the top of the editor explains why ("Read-only — you don't have edit access on this team"). **Play** is **not** rendered in the editor in E7.1 regardless of read/write (§4.10).
4. **No drafting in read-only:** edits are not staged locally; the input never accepts changes that would silently disappear.
5. **API gap (track in plan):** when `Setlist.permissions` (or equivalent per-resource flag) lands in the OpenAPI schema, both this rule and the create-dialog team check should switch to it. Captured as a follow-up in the decision log.

### 2.5 Error recovery — block until Retry or Discard

1. **5xx / network failure:** the editor enters the **error** state. Editing remains blocked. The save-state icon is the warning glyph; an inline action row appears below the title with **Retry** and **Discard**.
   - **Retry** re-fires the **same payload** (the failed field-diff). On success: clear error, return to idle. On failure: stay in error state.
   - **Discard** rolls the affected field back to the **last server-confirmed value** (for `songs` reorder, this matches the existing optimistic-rollback rule in §4.6; for `title`, this restores the last known persisted title and re-enables the input).
2. **429:** also enters the error state; the inline copy includes **honor `Retry-After`** — the **Retry** button is disabled with a countdown until `Retry-After` elapses, then re-enabled. No auto-retry.
3. **`Problem`** mapping per [api-integration.md](./api-integration.md): show `Problem.title` as the inline error copy (not a toast). Toasts are reserved for non-blocking feedback (e.g. "Picker: song not available").
4. **No silent auto-retry** — every failure is visible; "block input" pairs deliberately with explicit user choice to prevent drift.

### 2.6 Offline (mid-session transitions)

1. **Editing is online-only** in E7.1. When the browser reports `offline`, the editor enters a **frozen** mode immediately:
   - All editing affordances disabled per the read-only treatment (§2.4.3) but the offline copy / icon is used in the banner ("You're offline — editing paused").
   - **Typed but unsaved text remains in the input** (we do not destructively reset to the last server value). The user can still see what they were typing; we just won't accept further changes until the connection is back.
   - Any **debounced** PATCH that was waiting for the timer is **cancelled** (it would fail anyway); any **in-flight** PATCH is left to its `fetch` promise and will land in the §2.5 error state if it fails.
2. **On reconnect** (`online` event), do **not** silently flush. Show a small **Resume editing?** prompt anchored to the save-state icon with two actions:
   - **Retry** — re-fire the last pending field-diff (the locally typed-but-not-saved value) as a PATCH; on success → idle, editor unfreezes; on failure → §2.5 error state.
   - **Discard** — refetch `/setlists/:id` (server is source of truth), reset local state to the response, editor unfreezes clean.
3. **No outbox / no IndexedDB queueing.** This phase deliberately stays out of E4 territory; the prompt is the entire offline-resilience surface.
4. Editor offline behavior aligns with the global offline rule in [architecture.md](./architecture.md).

### 2.7 Mutation error mapping

Map server `Problem` / `ProblemDetails` per [api-integration.md](./api-integration.md): inline (§2.5) for save failures, toast for one-off non-save failures (e.g. picker fetch).

### 2.8 Multi-tab / cross-tab conflicts

1. **Last-write-wins per [setlist-editor.md](./setlist-editor.md) §Mutations.** Two tabs editing the same setlist can overwrite each other's PATCHes silently; **no** `BroadcastChannel`, **no** `If-Match`, **no** post-PATCH cross-tab invalidation in E7.1.
2. **Document the risk** in user-facing help (Settings / Help) when those surfaces grow; do not block this phase on it.
3. Revisit when E5+ adds richer team workflows or when the API exposes ETags.

---

## 3. Hub integration (setlists only)

1. **Primary list tap / keyboard activate:** **`/player`** with `type=setlist` and the row id — matches Collections / Songs hub behavior (`EntityListView`); **not** the editor.
2. **Long-press / context menu** on a setlist row: **Edit** → **`/setlists/:id`** (the editor entry point for **existing** setlists). **Delete**, **Duplicate**, **Play** (also navigates to **`/player`**); **omit Export** ([§0](./epic-e7-action-plan.md#0-skipping-e6--scope-adjustments)).
3. **`+` on `/setlists` — `CreateSetlistDialog` (bottom drawer):**
   1. **Pattern:** mirror **`CreateTeamDialog`** from **E5** ([app/src/components/teams/CreateTeamDialog.tsx](../app/src/components/teams/CreateTeamDialog.tsx)) — Radix `Dialog` + Framer Motion bottom sheet with the same drag-to-dismiss handle, header, `Cancel` / `Create` buttons, and inline error styling.
   2. **Fields:**
      - **Title** (required, non-empty after `trim()`).
      - **Team picker** (target team for `owner` in `CreateSetlist`): **show only when** the signed-in user has **>1 writeable team**; default = **last-used** writeable team (persist in `localStorage` after each successful create) **or** the user's **personal team** on first run. **Hide** entirely (and omit `owner`) when the user has exactly one writeable team — server creates under personal team by default per **`CreateSetlist`** OpenAPI (`owner` optional).
   3. **Submit:** `POST /api/v1/setlists` with `{ title, owner?, songs: [] }` per the **`CreateSetlist`** schema. **`songs` is empty on create** — the picker / Cmd-K insert in the editor (§4) is the only path to add songs.
   4. **Failure:** **inline error** in the dialog (Problem `title` if available, generic fallback otherwise); **stay open**; user can retry **without** closing. **No** toast for create failure (toast pattern is for failures during the editor session, not the create dialog). Keep mutation idempotency simple — disable the **Create** button while in flight (mirror Team dialog's `mutation.isPending`).
   5. **Success:** invalidate setlists list query, close dialog, navigate to **`/setlists/{id}`** (the editor opens with the empty new setlist).
   6. **Abandoned setlists:** **No auto-delete.** If the user creates and then leaves an empty/untitled-after-edit setlist, it persists in **`/setlists`** and can be removed via **long-press → Delete**. **Justification:** the user already confirmed "Create" in the dialog; cleanup heuristics risk surprising data loss and complicate offline reconciliation later.

   **Other hubs:** **`+`** stays **no-op** or existing behavior until **E7.2** / **E7.3** (**recommended:** defer — avoid half create flows).
4. **Cmd-K — Navigate (hub-level):** **Navigate** entries may include **`/setlists/:id`** for known setlists when listing them is in scope. Editor-active **Insert song** behavior lives in [§4.7](#4-setlist-editor-screen-setlistsid).
5. **Back from setlist editor:** **`/setlists`** with **scroll at top** after navigation per [setlist-editor.md](./setlist-editor.md).

---

## 4. Setlist editor screen (`/setlists/:id`)

1. **Initial load — single call + per-row lazy hydration:**
   - Call **`GET /api/v1/setlists/{id}`** once. The response carries the **full `SongLink[]`** (per OpenAPI `Setlist.songs`); the order array is **complete in one round-trip** — autosave (§2.1) can safely PATCH after the user's first edit.
   - **Do NOT call `GET /api/v1/setlists/{id}/songs`** in E7.1 — that paginated bulk-hydration endpoint is **unused** by this editor. Display data for each row (title, subtitle, default key, `not_a_song` flag) comes from **`GET /api/v1/songs/{id}`**, one TanStack Query per slot **after** detail resolves (**parallel fetch for all slots in v1**, not viewport-gated); the picker / Cmd-K path uses the same hook and cache keys for duplicate counts and eligibility. **Caveat:** this **supersedes** the "load all pages of `…/setlists/{id}/songs` before full edit readiness" wording in [setlist-editor.md](./setlist-editor.md) §Pagination — that doc reflects this model for E7.1+.
   - **Editing affordances unlock as soon as `GET /api/v1/setlists/{id}` resolves** — rows render with a small per-row skeleton until their lazy `GET /songs/{id}` resolves; reorder operates on `SongLink.id` and does not block on hydration.
2. **`SongLink.nr`:** **Always omit / null**; order = array index.
3. **Per-slot `key` (inline chip):** each row shows a small **`Key: G`** chip (G = the song's default key when unpinned, with a subtle indicator that it's the default; the pinned key when set). **Tap / click** opens a small popover with the 12 keys plus a **Default** option. Choosing a key sets **`SongLink.key`** to that key; choosing **Default** sets `SongLink.key` to **null**, falling back to the song's default. The chip update mutates `songs` and triggers a debounced PATCH (§2.1). On a **broken row** (§4.5) the chip is hidden — there is no default to inherit from.
4. **`PATCH /api/v1/setlists/{id}`** for **title** + **`songs`** — coordinated by the autosave coordinator from §2.1 (750 ms debounce, single in-flight PATCH, field-diff payload per §2.2, save-state icon per §2.3, error handling per §2.5).
5. **Invalid / unavailable `SongLink.id`:**
   - **Detection:** lazy hydration of each row (e.g. `GET /api/v1/songs/{id}` for display data) — a row whose hydration returns **404**, **403**, or whose hydrated `not_a_song === true` is marked **broken**.
   - **UI:** the broken row shows an inline error badge ("Unavailable") in place of the song title; the per-row **Remove** affordance remains active; reorder of a broken row is allowed (it's still a slot).
   - **Save gate:** while **any** row is broken, **autosave is paused** and the editor enters the §2.5 error state with copy "Remove unavailable songs to keep saving" — only the **Discard** action there reverts local edits to the last server-confirmed `songs`; **Retry** is hidden because the PATCH would fail by design until the user intervenes. Removing the last broken row clears the gate and resumes normal autosave.
6. **Reorder — `@dnd-kit`-based:**
   1. **Library:** standard **`@dnd-kit`** set — **`@dnd-kit/core`**, **`@dnd-kit/sortable`**, **`@dnd-kit/modifiers`** (`restrictToVerticalAxis`, `restrictToParentElement` for clean motion bounds), and **`@dnd-kit/utilities`** (CSS helpers used by `useSortable`). All four are new dependencies in this phase. Justification: built-in keyboard / pointer / touch sensors with strong a11y story; widely used; lighter than full DnD frameworks.
   2. **Pointer / touch:** drag a row's grip handle (always visible) to reorder. **Optimistic** UI; on PATCH failure, **rollback** to last server-confirmed order and surface the §2.5 error state (warning icon + Retry / Discard) — no silent toast for save errors per the §2.5 / §2.7 split (toasts are for non-save feedback only).
   3. **Keyboard (a11y, required v1):** **grab-focus** model via `@dnd-kit` `KeyboardSensor`. Focus a row → **Space** to grab → **Arrow Up/Down** to move → **Space** to drop → **Esc** to cancel and restore original position. **Live region** announces "Picked up *Song Title* (position N of M)", "Moved to position K", "Dropped at K", "Cancelled". No separate Move-up / Move-down buttons in the row chrome — the grip handle plus keyboard sensor is the single canonical reorder surface.
   4. **In-flight gating:** while a PATCH is in flight (§2.1 `block_input`), grab gestures are denied (`KeyboardSensor` and `PointerSensor` activation guarded); the live region announces "Saving — try again in a moment".
7. **Add — bottom-drawer picker (single component, two entry points):**
   1. **Shape:** **bottom drawer everywhere** (phone, tablet, desktop) — mirrors the **`CreateTeamDialog`** pattern (Radix `Dialog` + Framer Motion bottom sheet, drag-to-dismiss handle). One component, no breakpoint forks.
   2. **Entry points:** the editor's **Add song** button (everywhere) and **Cmd-K Insert song** when the editor is the active route (tablet/desktop with hardware keyboard, per [app-shell.md](./app-shell.md)). Cmd-K behavior detailed in §4.8 below.
   3. **Search:** **`GET /api/v1/songs?q=…`** with **300 ms debounce + `AbortController`** matching the header search rule in [api-integration.md](./api-integration.md). When `q` is non-empty, send **`sort=relevance`**. **No extra tabs** (no Recent, no Liked) in v1; the single `q` list is the result set.
   4. **Eligibility:** **exclude `not_a_song: true`** at the picker level (filter client-side from the page; if the API later supports a `not_a_song=false` filter, prefer that). Picker error if API returns one anyway is a no-op (do not insert; toast).
   5. **Duplicate handling:** duplicates are **allowed** (per [setlist-editor.md](./setlist-editor.md)). When a candidate is **already in the open setlist**, the row shows a small badge `Already in setlist (×N)` where N is the current count for that song id. Tapping the row still adds another instance — **no confirm step**, **no block**.
   6. **Multi-add:** **out of scope v1** — tapping a row inserts one song at the **end** of `songs`, the picker **closes**, the editor returns to focus on the new row. Reopening picker is one tap / Cmd-K away.
   7. **In-flight gating:** the picker may **open** and the search field accepts typing while a PATCH is in flight; only the **insert action** waits for the in-flight PATCH to resolve before mutating `songs` (§2.1).
8. **Cmd-K Insert song (tablet/desktop with keyboard):**
   1. When the active route is **`/setlists/:id`** and the user has write access (§2.4), Cmd-K registers an **Insert song** mode that shows song results **inline in the palette** (not the drawer picker).
   2. **Inline results:** same `q` semantics as the drawer picker (§4.7.3) and same eligibility (§4.7.4) and duplicate badge (§4.7.5). **Enter** inserts the highlighted row and **closes the palette**; the editor regains focus on the new row.
   3. The shared filtering / duplicate / abort logic lives in one hook (e.g. `useSongPickerQuery`) consumed by both the drawer picker and the palette.
9. **Remove:** **Swipe-to-delete** on touch (gesture precedence document with the drag handle: vertical drag = reorder, horizontal swipe past threshold = remove); **per-row delete button** revealed on hover/focus on pointer breakpoints. **Undo snackbar** for the last destructive action (single-action stack — undoing a remove restores the slot at its original index; subsequent destructive actions overwrite the snackbar). Snackbar timeout: standard ~5 s.
10. **Play:** **No Play affordance is rendered in the editor in E7.1.** The flush-before-Play rule in [setlist-editor.md](./setlist-editor.md) remains the normative target for **E8** — implement Play wiring (and its flush) in **E8** (or in a follow-up patch to E7.1 the moment E8 lands), not now.
11. **Move / delete setlist:** **List / long-press only** — not in editor.
12. **Phone layout (small viewports):** title is **sticky at the top** of the editor; the song list scrolls beneath. The on-screen keyboard is allowed to push content via the standard viewport behavior (`100dvh` / `interactive-widget` defaults from the existing app shell); **no special split-view or modal title editor on phone** in v1. Revisit if user testing flags friction.
13. **i18n:** EN + DE — keys live under `setlists.editor.*` for editor surface and `setlists.create.*` for the create dialog. Implementer chooses copy text consistent with brand voice.

---

## 5. TanStack Query (setlists)

1. **After successful PATCH:**
   - **`setQueryData`** on **`/setlists/:id`** detail with the PATCH response body — the editor's local cache becomes immediately consistent with the server, no extra round-trip.
   - **Mark the `/setlists` infinite list query stale** via `invalidateQueries({ queryKey: hubListKey('setlists', q), refetchType: 'none' })` (per the existing `hubListKey` helper in [`app/src/lib/hub-list-keys.ts`](../app/src/lib/hub-list-keys.ts)) so the list refetches on **next focus / next mount** but the editor does not trigger a network spike for the list while the user is still editing. Invalidate **all `q`** variants by passing the partial key `[...hubListRootKey, 'setlists']`.
2. **After successful POST (create flow, §3.3):** `invalidateQueries({ queryKey: [...hubListRootKey, 'setlists'] })` (active refetch). The new **`/setlists/:id`** detail is hydrated by the navigation, not by `setQueryData` from the create response, to avoid drift between create response shape and detail response shape.
3. **Optimistic** reorder only where specified (§4.6); rollback on error per §2.5.
4. Detail query key for **`/setlists/:id`**: pick a single canonical shape — proposal **`['setlistDetail', id]`** — and document it in [api-integration.md](./api-integration.md) when the editor lands so E7.2/E7.3 can mirror it for collections / songs detail.

---

## 6. Tests

**Unit tests are required for E7.1 exit; component / E2E coverage is optional.**

1. **Required (Vitest, pure functions and hooks with stubs):**
   1. **`SongLink[]` array helpers** — `move(from, to)`, `insert(songLink, atIndex)`, `remove(index)`, plus an `applyOptimistic(prev, op)` for reorder rollback. Edge cases: out-of-range indices, empty arrays, duplicate ids.
   2. **Autosave coordinator** (e.g. `useAutosave` in isolation with mocked timers + mocked PATCH): debounce window, flush triggers (router-leave, visibility hidden, picker-open), in-flight `block_input` policy (new edits during flight do not start a parallel PATCH and do coalesce), 429 with `Retry-After` countdown, error-state Retry / Discard, queue depth = 1.
   3. **Broken-row detection** — given a setlist `SongLink[]` and a hydration result map (id → 200 / 404 / 403 / `not_a_song:true`), produce the broken-rows set and the save-gate boolean per [§4.5](#4-setlist-editor-screen-setlistsid).
   4. **Field-diff payload** — given a baseline `Setlist` and a dirty UI state, produce the `PATCH` body containing only changed top-level fields per [§2.2](#22-patch-payload--field-diff-per-window).
2. **Optional (component tests with Testing Library):**
   1. `CreateSetlistDialog` — title required, error inline, success closes + invalidates query.
   2. Picker drawer — `q` debounce + `AbortController`, duplicate badge, `not_a_song` exclusion.
   3. Editor read-only mode — title `readOnly`, drag handles hidden.
3. **Not in scope:** Playwright / E2E smoke for E7.1. (E2E is **E10**.)

---

## 7. Documentation (this phase)

1. **[pages-and-flows.md](./pages-and-flows.md)** / **[app-shell.md](./app-shell.md):** **Setlist** **Edit** + **New setlist**; point to [E7.2](./epic-e7.2-action-plan.md) / [E7.3](./epic-e7.3-action-plan.md) for remaining editors.

---

## 8. Exit checklist (manual)

1. **`/setlists/:id`** loads, saves, read-only/offline behaviors per spec ([§2.4](#24-permissions-and-read-only), [§2.6](#26-offline-mid-session-transitions)).
2. **Autosave loop** observable: typing pauses → spinner → check; in-flight blocks input briefly; 5xx surfaces inline Retry / Discard ([§2.1](#21-autosave-coordinator-useautosave-or-equivalent), [§2.5](#25-error-recovery--block-until-retry-or-discard)).
3. **Reorder** (pointer drag + keyboard grab-focus) with optimistic UI and rollback on failure ([§4.6](#4-setlist-editor-screen-setlistsid)); **picker** drawer + **Cmd-K** inline both insert via the same hook ([§4.7](#4-setlist-editor-screen-setlistsid), [§4.8](#4-setlist-editor-screen-setlistsid)); **undo snackbar** restores a removed slot ([§4.9](#4-setlist-editor-screen-setlistsid)).
4. **Per-slot key chip** ([§4.3](#4-setlist-editor-screen-setlistsid)) sets / unsets `SongLink.key`; default state is visibly distinguished from pinned.
5. **Broken rows** (404 / 403 / `not_a_song:true` after hydration) block autosave with the documented copy and clear when removed ([§4.5](#4-setlist-editor-screen-setlistsid)).
6. **`+`** on setlists opens **`CreateSetlistDialog`**, POSTs only on Create, navigates into editor; **long-press Edit** opens existing setlist; **hub tap** opens **`/player`**, not the editor; **no WASM** dependency in bundle for this flow.
7. **Logged-out** deep link to **`/setlists/:id`** redirects to **`/setlists`** post-login (return_to drops the editor path).
8. **Offline mid-edit:** going offline freezes editing and preserves typed text; reconnect prompts **Resume editing? (Retry / Discard)** ([§2.6](#26-offline-mid-session-transitions)).
9. **No Play button in editor** in E7.1; flush-before-Play is **E8** work (see [§4.10](#4-setlist-editor-screen-setlistsid)).
10. **EN + DE** for new setlist editor + create dialog UI.
11. **Required Vitest suites** (see [§6](#6-tests)) green in CI.

When E7.1 passes, start [E7.2](./epic-e7.2-action-plan.md).

---

## Related docs

- [Epic E7 index](./epic-e7-action-plan.md)
- [Setlist editor](./setlist-editor.md)
- [Epic E2 action plan](./epic-e2-action-plan.md)
