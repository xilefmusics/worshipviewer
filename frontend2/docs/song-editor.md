# Song editor (`/songs/:id`)

Normative UX and client behavior from the **2026-04-20** design grill. Implement the screen against this doc plus [pages-and-flows.md](./pages-and-flows.md), [api-integration.md](./api-integration.md), [openapi.json](./openapi.json), and [architecture.md](./architecture.md).

## Editing model

- **Hybrid surface:** ChordPro / WorshipPro **source** is the primary editable buffer, with a **rendered preview** from **chordlib WASM** alongside or below (exact layout is implementation detail; both must stay visible in the default viewport on phone without trapping focus solely in one pane).
- **Single pipeline:** Parsing for preview and for PATCH payload must share one logical parse result so preview and saved `data` do not diverge.
- **`not_a_song`:** **Not editable** in the song editor. Display it as **read-only** (e.g. chip or field) from `Song.not_a_song`; changing it is out of scope for this screen (server/admin or other flows).

## Metadata and structured fields

- **Header / chrome title:** Use **`data.titles[0]`** as the headline when non-empty; if empty, follow list-row fallbacks until the user sets a title.
- **Metadata strip (v1):** Provide controls for **subtitle**, **languages** (BCP 47 tags), **artists**, **copyright**, **tempo**, **time** signature, and **default key** — aligned with `SongDataSchema` / `PatchSongData`.
- **Sync with source:** When the user edits ChordPro directives that imply metadata (e.g. `{title}`), either update the strip from parse results or treat those edits as conflicting with strip edits — **implementation must pick one rule and apply it consistently**; recommended: **directive → strip** on parse after local edit, and **strip → source** insert/update directives on strip commit if the product wants bi-directional sync.

## WASM / chordlib

- **Load gate:** If WASM fails to load, **block** editing (loading or error state with **Retry**). Do not allow typing in the source buffer until chordlib is ready — strict parse-on-save depends on a working parser.
- **Validation:** **Strict ChordPro:** run the same parse used for preview **before** issuing `PATCH`; **block save** on parse errors with **inline** markers or list of issues (align error presentation with [api-integration.md](./api-integration.md) for server `Problem` where applicable).

## Saves and conflicts

- **Mutations:** Prefer **`PATCH /api/v1/songs/{id}`** with body per [openapi.json](./openapi.json) (`PatchSong`; **`data` is required**).
- **Payload strategy:** On each debounced flush or explicit save, send a **full snapshot** of current `PatchSongData` derived from editor state (**all fields populated** from the latest parse + metadata strip), not sparse per-field diffs — keeps client logic simple and matches “replace logical document” behavior while still using `PatchSongData` shape.
- **Debouncing:** **Debounced PATCH** for edits; **flush** any pending debounced save on **route change** and before **Play** (navigate away or `/player`).

## Play navigation

- **Play with pending changes:** **Flush** debounced save (wait for successful PATCH or surface failure), **then** navigate to `/player?type=song&id=…` — same pattern as [setlist-editor.md](./setlist-editor.md).
- **`liked`:** **Lists only** — do **not** duplicate like/unlike in the song editor chrome (API `POST .../like` / `POST .../unlike` from list or other surfaces).

## Blob attachments

- **Song editor v1:** **No** upload, remove, reorder, or primary-blob management in the editor (see **Song editor grill** table in [grill-session.md](./grill-session.md)). Treat blob handling as **player-focused** or a later iteration; the editor may show a **read-only** count or hint linking forward only if product adds that without violating “player-only.”

## Move and delete

- **Move team** (`POST .../move`): **Songs list / long-press / context menu only** — **not** in the song editor (parity with setlist “move” placement).
- **Delete song:** **List / context only** — no delete-entire-song action in the editor (parity with setlist editor).

## Permissions and offline

- **Read-only library:** Show **read-only** editor when the user lacks write access; **Play** remains available if the user can read the song.
- **Offline:** **Read-only** with a short explanation; **no** local drafts — [architecture.md](./architecture.md) applies (editing is online-only until a later phase).

## Command palette (Cmd-K)

- **No editor-specific** palette behavior: **global** search/commands only (contrast with setlist editor’s insert-song behavior — the song editor does not add special Cmd-K affordances in v1).

## Concurrent edits

- **Conflict strategy (MVP):** **Last successful PATCH wins** — no `If-Match` / ETag workflow in v1; rare cross-tab overwrite accepted.

## Errors and rate limits

- **429:** **Toast** + manual retry; honor **`Retry-After`** when present (same as setlist editor).

## Presentation

- **i18n:** **Translation keys from day one** for user-visible strings in the editor.

## Related docs

- [Plan / decision log](./plan.md)
- [Pages and flows](./pages-and-flows.md)
- [Setlist editor](./setlist-editor.md) (autosave/Play/debounce parity)
- [Design grill session](./grill-session.md)
- [Architecture](./architecture.md)
