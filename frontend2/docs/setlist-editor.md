# Setlist editor (`/setlists/:id`)

Normative UX and client behavior from the **2026-04-20** design grill. Implement the screen against this doc plus [pages-and-flows.md](./pages-and-flows.md), [api-integration.md](./api-integration.md), and [openapi.json](./openapi.json).

## Data loading

- **Song rows:** Do not require full `Song` payloads for the main list. Use `GET /api/v1/setlists/{id}` (`Setlist.songs` as `SongLink[]`) for order and slot metadata. **Hydrate** full `Song` per slot via **`GET /api/v1/songs/{id}`** (TanStack Query per id) once the setlist detail has loaded — **v1 runs these fetches in parallel for every slot** (not gated on viewport visibility); reuse the same queries from the picker / Cmd-K paths where applicable.
- **Pagination (E7.1 update):** the editor **does not call** `GET /api/v1/setlists/{id}/songs`. The single `GET /api/v1/setlists/{id}` returns the complete `SongLink[]` order in one round-trip; **`GET /api/v1/songs/{id}`** hydrates each slot **in parallel** once detail is loaded (v1 is **not** viewport-gated). The earlier "load all pages" rule is **superseded** for E7.1+ — see [epic-e7.1-action-plan.md §4.1](./epic-e7.1-action-plan.md#4-setlist-editor-screen-setlistsid). If a future paginated `Setlist.songs` representation lands, this section will be revisited.
- **`SongLink.nr`:** For setlists, **always omit / leave `null`** (`None` on the server). Display order is **array position only**. User-facing numbering is implied by position. (**Collections** remain the place where `nr` can be user-overridden; this doc is setlist-specific.)
- **Per-slot `key`:** When a song is added, default the slot `key` from the song's default key. The user may **pin** a different key for that slot (`SongLink.key`). **UI (E7.1):** an inline `Key: …` chip per row opens a small popover with the 12 keys plus **Default** (sets `SongLink.key` to `null`).

## Eligibility rules

- Songs with **`not_a_song: true`** must **never** be addable to a setlist (picker, Cmd-K, API error handling). Align with backend if the API allows otherwise.

## Mutations

- Prefer **`PATCH /api/v1/setlists/{id}`** for title and `songs` changes; avoid `PUT` unless a future flow explicitly requires full replacement.
- **Title:** **Debounced PATCH** (same coalescing strategy as other field edits).
- **Concurrent edits:** **Coalesce/debounce** into a single PATCH where practical; **flush** any pending debounced save on **route change** (navigate away) so nothing is left unsent unintentionally.
- **Conflict strategy (MVP):** **Last successful PATCH wins** — no `If-Match` / ETag client workflow in v1; accept rare cross-tab overwrite risk.
- **Invalid references:** If a `SongLink.id` is missing, inaccessible, or invalid, **block save** until the user removes or replaces those slots. Surface which rows are invalid without requiring full song hydration for every row.

## Reorder and optimistic UI

- **Drag-reorder:** **Optimistic** list update; **rollback** list order on **`PATCH` failure** and surface the **autosave error row** (icons + inline **Retry / Discard**) — **no toast** for save failures ([epic-e7.1-action-plan.md §2.5](./epic-e7.1-action-plan.md#25-error-recovery--block-until-retry-or-discard)).
- **Keyboard and screen readers:** **Grab-focus model** (`@dnd-kit` `KeyboardSensor`): **Space** grab → **Arrow Up/Down** move → **Space** drop → **Esc** cancel; **live region** announcements for pickup/move/drop/cancel; **no** separate Move-up/Move-down buttons in v1 ([epic-e7.1-action-plan.md §4.6](./epic-e7.1-action-plan.md#4-setlist-editor-screen-setlistsid)).

## Add and remove songs

- **Add:** Primary flow is a **modal or sheet** with **search** (same `q` semantics as the songs list where applicable).
- **Cmd-K:** The command palette may **insert a song into the open setlist editor** when that context is active — share implementation with the modal picker so filtering (e.g. `not_a_song`) and duplicate rules match.
- **Duplicates:** The **same song id may appear more than once** in one setlist (e.g. repeats).
- **Multi-add:** **Out of scope for v1** — one song per add action.
- **Remove:** **Swipe to delete** on touch; ensure this does not fight keyboard reorder or focus (define hit targets and gesture precedence in implementation).
- **Undo:** **Transient toast** (Sonner) with **Undo** for the last **destructive** action (e.g. remove slot); failed reorder **rollback** uses the **autosave error row**, not a success toast ([epic-e7.1-action-plan.md §2.5](./epic-e7.1-action-plan.md#25-error-recovery--block-until-retry-or-discard)).

## Play and navigation

- **E7.1 deferral:** the **editor ships without a Play affordance** in [epic-e7.1-action-plan.md](./epic-e7.1-action-plan.md). Open playback from the **setlists hub** (primary tap / context **Play**) or later from the editor when **E8** lands. The flush-before-Play rule below remains the **normative target for E8**.
- **Play with unsaved changes:** **Auto-save** (flush debounced PATCH / apply pending order) **then** navigate to `/player?type=setlist&id=…`.
- **Read-only library (no write):** Show **read-only** editor (no drag, no add/remove, title not editable). **Playback:** use **hub tap** or context-menu **Play** (same as writable hub rows); **no Play control inside the editor** until **E8**.
- **Move setlist to another team:** **List screen only** (`POST .../move` from long-press / context menu), **not** from the editor.
- **Delete setlist:** **List screen only** — no delete-entire-setlist action in the editor.
- **Back to `/setlists`:** Restore list with **scroll at top** (consistent with post-refresh behavior on list routes; differs from “preserve scroll” patterns some apps use).

## Empty, loading, errors

- **Empty setlist:** Strong **Add songs** CTA; **no Play in the editor** in E7.1 — users **Play** from the hub row once songs exist (or after leaving the editor).
- **Initial load:** **Simple** generic list **skeleton** (not necessarily matching every final chrome detail).
- **`PATCH` autosave (429 / 5xx / network):** **Inline** error with **Retry** and **Discard**; **429** disables Retry until **`Retry-After`** elapses (**countdown**). **No toast** for failed saves — toasts stay on **non-blocking** feedback (e.g. picker eligibility).
- **Other requests:** honor **`Problem`** / **`Retry-After`** per [api-integration.md](./api-integration.md); **toast** where that doc calls for transient hub/list feedback.

## Offline and player cache

- **Editing** follows global rules: **online-only** until a later phase ([architecture.md](./architecture.md)).
- **E7.1 client behavior:** While offline, the editor **pauses** mutating autosave and shows a **short banner**; when the client comes back online, it may offer **resume** (retry sync) vs **discard and reload** if there was a **save failure** banner. **Visibility change / page hide / beforeunload** still **best-effort flush** a small PATCH (`keepalive` where supported) so tab close does not always drop the last debounced edit.
- After saves, **do not** show extra copy about **stale Dexie / offline player** mirrors; architecture already defines **silent** behavior until the next online player open.

## Presentation

- **Row titles:** Wrap up to **two lines**, then **ellipsis**.
- **i18n:** Use **translation keys from day one** for editor strings.

## Related docs

- [Plan / decision log](./plan.md)
- [Pages and flows](./pages-and-flows.md)
- [App shell](./app-shell.md)
- [API integration](./api-integration.md)
- [Design grill session](./grill-session.md)
