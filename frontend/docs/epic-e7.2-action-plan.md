# Epic E7.2 — Collection editor (no WASM)

**Parent:** [E7 — Content editors](./roadmap.md#e7--content-editors-collections-songs-setlists) · [E7 phase index](./epic-e7-action-plan.md)

**Skipping E6:** [§0 — scope adjustments](./epic-e7-action-plan.md#0-skipping-e6--scope-adjustments) (export/import deferred until E6).

**Prerequisites:** E1–E5 per [roadmap](./roadmap.md); **[E7.1](./epic-e7.1-action-plan.md) complete** (shared autosave primitives, hub patterns, picker/Cmd-K, and reference implementation on the setlist editor).

**Normative UX:** [pages-and-flows.md](./pages-and-flows.md), [app-shell.md](./app-shell.md), [api-integration.md](./api-integration.md), [architecture.md](./architecture.md), [openapi.json](./openapi.json). Ordering / `SongLink` semantics vs setlists remain documented in [setlist-editor.md](./setlist-editor.md) where they overlap (`nr` differs — see §4).

**Next:** [Epic E7.3 — Song editor + ChordEngine](./epic-e7.3-action-plan.md)

---

## Outcome

Users can **create and edit collections** (title; ordered `SongLink[]`; **`nr`** per slot; optional **cover** when the UI exposes it; per-slot **`key`** like setlists) with the **same editor UX vocabulary as E7.1**: hub navigation model, autosave coordinator, save-state icon, read-only/offline gates, picker + Cmd-K insert, DnD + keyboard reorder, broken-row save gate, and undo-remove snackbar. **No Play affordance in the collection editor in E7.2** — the flush-before-Play rule stays normative for **E8**, same decision as **E7.1** ([setlist-editor.md](./setlist-editor.md)).

E7.2 is an **internal milestone** toward E7; **no** new “Suggested release cut” row in [roadmap.md](./roadmap.md) solely for E7.2. The **E7** release cut still requires **E7.1–E7.3**.

**No** song source editor; **no** `ChordEngine` / chordlib WASM in bundle for collection flows.

---

## Exit (E7.2)

- Route **`/collections/:id`** with **normal app shell**; on **`/collections`**, **primary tap / Enter / Space** opens **`/player`** for that collection (**same hub rule as Collections / Songs / Setlists**). **Edit** is reachable via **long-press / context menu** (and create/deep links). **No Play affordance inside the editor** in E7.2 — see §4.10.
- **Create flow** on **`/collections`**: **`+`** → **`CreateCollectionDialog`** (bottom-drawer, mirrors **`CreateTeamDialog`** / **`CreateSetlistDialog`**) → on **Create**: **`POST /api/v1/collections`** → **`/collections/{id}`**. The **`+`** control never POSTs by itself.
- **`return_to` allowlist:** **`/collections/:id` is NOT allowlisted.** A logged-out deep link into the editor **bounces to `/collections`** after auth (mirror [E7.1 §1](./epic-e7.1-action-plan.md#1-routing-and-deep-links)).
- Editor behavior mirrors **§2** (autosave policy) and **§4** (screen behavior) below; PATCH **field-diff** for **`title`**, **`songs`**, and **`cover`** when dirty (omit unchanged fields — see §2.2).
- **i18n:** EN + DE for **collection editor** strings — keys under `collections.editor.*` / `collections.create.*` (reuse sibling namespaces only when meaning is identical, e.g. shared dialog chrome).
- **Still no WASM** for this flow.

---

## 0. Out of scope (explicit)

| Topic | Where it belongs |
|-------|------------------|
| **Play affordance in the editor** (button + flush-before-Play) | **E8** — same framing as **E7.1** §4.10 |
| **Song detail editing** (lyrics, ChordPro, blobs, chordlib) | **E7.3** |
| **Setlist editing** | **E7.1** (done) |
| **Blob picker / artwork upload UX** beyond a trivial `cover` string default | defer unless minimal `cover` parity is trivial |
| **Multi-add picker** (select N songs per open) | post-MVP (same as E7.1) |
| **Recent / Liked** picker tabs | post-MVP |
| **IndexedDB outbox** / offline edit queue | E4 territory; not introduced here |
| **`BroadcastChannel` / cross-tab sync** | not in v1 — [E7.1 §2.8](./epic-e7.1-action-plan.md#28-multi-tab--cross-tab-conflicts) |
| **`If-Match` / ETag conflict UX** | not in MVP client |
| **Per-resource permission flag from API** | API gap — same follow-up posture as **E7.1** §2.4 |
| **Move collection to another team** from inside the editor | list-only |
| **Delete collection** from inside the editor | list-only |
| **Export rows** | **E6** |
| **Import** entry on **`+`** | **E6** |

---

## 1. Routing and deep links

1. Add authenticated **`/collections/:id`** with the **standard app shell** (not **`/player`**).
2. **Deep-linkable** while signed in; works after PWA reload.
3. **`return_to`:** **`/collections/:id` excluded** — post-login bounce to **`/collections`** ([E7.1](./epic-e7.1-action-plan.md) rationale applies).

---

## 2. Shared editor building blocks (inherit E7.1 exactly)

[E7.1 §2 — Shared editor building blocks](./epic-e7.1-action-plan.md#2-shared-editor-building-blocks-setlist-sized) is **normative for E7.2 verbatim**, with only these substitutions:

| E7.1 | E7.2 |
|------|------|
| `/setlists/:id` | `/collections/:id` |
| `GET /api/v1/setlists/{id}` | `GET /api/v1/collections/{id}` |
| `PATCH /api/v1/setlists/{id}` | `PATCH /api/v1/collections/{id}` ([`PatchCollection`](./openapi.json) — absent fields unchanged) |
| `useCanEditSetlist` | **`useCanEditCollection(collection)`** — same predicate: **`library-edit`** on the resource’s **`owner`** team |
| Dirty top-level fields | **`title`**, **`songs`**, and **`cover`** when the UI mutates cover |
| Banner copy | localized “collection” wording; same structural states (read-only / offline / error) |

**Reminder — numbers are locked to E7.1:**

- **750 ms** debounce; **flush** on route leave, `visibility hidden`, `pagehide`/`beforeunload` (keepalive), **before picker open / Cmd-K insert**.
- **`block_input`** during HTTP; **queue depth = 1**; **field-diff PATCH** ([E7.1 §2.2](./epic-e7.1-action-plan.md#22-patch-payload--field-diff-per-window)); **`songs`** when dirty **always sends full `SongLink[]`** (no per-row diff).
- Save-state icon **states** (**idle / pending / saving / error**) + **`aria-live="polite"`** ([E7.1 §2.3](./epic-e7.1-action-plan.md#23-save-state-indicator--icon-only-with-aria-live)); **no** “Saved at HH:MM”.
- Errors: **inline Retry / Discard**; **Problem.title** inline; **429 + `Retry-After`** countdown; **no silent auto-retry**; save failures **are not toasted** ([E7.1 §2.5](./epic-e7.1-action-plan.md#25-error-recovery--block-until-retry-or-discard)).
- **Offline freeze** + **Resume editing? (Retry / Discard)** after reconnect ([E7.1 §2.6](./epic-e7.1-action-plan.md#26-offline-mid-session-transitions)).

**`cover` in field-diff:** If the Phase ships **only** title + songs UX, **`cover`** may remain at the create-time default (**`""`**) until a cover picker exists; once the user can edit cover, PATCH includes **`cover`** in the diff like any other scalar. **Prefer** PATCH over PUT for edits (OpenAPI **`patch_collection`**); avoid full PUT unless unavoidable.

---

## 3. Hub integration (collections only)

1. **Primary list activation** → **`/player`** (`type=collection`, `id`).
2. **Long-press / context menu:** **Edit** → **`/collections/:id`**; **Delete**, **Duplicate**, **Play** (also **`/player`**); omit **Export** ([E7 §0](./epic-e7-action-plan.md#0-skipping-e6--scope-adjustments)).
3. **`+` on `/collections` — `CreateCollectionDialog`:**

   **Pattern:** Mirror **`CreateSetlistDialog`**: Radix **`Dialog`** + Framer Motion **bottom sheet**, same drag-dismiss handle, **`Cancel`** / **`Create`**, inline error styling (**[E7.1 §3.3](./epic-e7.1-action-plan.md#3-hub-integration-setlists-only)**).

   **Fields:**

   - **Title** (required, trimmed).
   - **Team picker**: **only when** the user has **>1 writeable team** — default **last-used** writeable (`localStorage`), else **personal team**; **omit `owner`** when exactly one writeable team (mirror setlist create semantics).
   - **`cover`:** **`CreateCollection` requires `cover`** — supply **`""`** until a picker exists unless art selection ships in E7.2.

   **`POST`** body: **`{ title, owner?, cover, songs: [] }`** (`songs` empty on create; **add/remove** occurs only inside the editor — same rationale as **`CreateSetlist` + empty `songs`**).

   **Failure:** Inline error; dialog **open**; **Retry**; **Create** disabled while pending; **no toast** on create POST failure.

   **Success:** Invalidate collections list query variants; navigate **`/collections/{id}`**.

   **Abandonment:** Do **not** auto-delete empty collections created then left — duplicate **E7.1** posture (user confirmed **Create**).

4. **`/setlists`** **+** unchanged from **E7.1**.

5. **`/songs` `+`** remains deferred to **E7.3** unless already covered.

6. **Back from editor** → **`/collections`** — **scroll to top** after navigation (**mirror setlist-editor back rule** behavior for symmetry across hubs).

---

## 4. Collection editor screen (`/collections/:id`)

### 4.1 Initial load — detail + hydration

**Same model as setlist:** call **`GET /api/v1/collections/{id}`** once — response includes the **complete `SongLink[]`**. **`Do NOT`** use **`GET /api/v1/collections/{id}/songs`** as a prerequisite for editing; that bulk endpoint paginates **`Song`** records and duplicates what lazy **`GET /api/v1/songs/{id}`** already supplies for row rendering. Hydrate rows with **parallel `GET /api/v1/songs/{id}`** per slot after detail resolves — **reuse or factor** **`useSongPickerQuery` / hydration cache keys with E7.1** so picker + Cmd-K behave identically.

**Editing unlocks immediately** detail returns; reorder uses **`SongLink.id`** skeleton rows until hydrated.

### 4.2 `SongLink.nr` (collections)

**User-visible** unlike setlists (**setlists omit / null — [setlist-editor.md](./setlist-editor.md)**). **`nr`** is a **nullable string** (e.g. `"1"`, `"2a"`) — ship an **inline field** per row bound to **`SongLink.nr`**; edits debounce inside the shared **`songs`** patch like other mutations. Clearing maps to **`null`**.

### 4.3 Per-slot `key`

**Identical UX to setlist §4.3**: **`Key:`** chip, popover (12 keys + **Default → `null`**) (**[E7.1 §4.3](./epic-e7.1-action-plan.md#4-setlist-editor-screen-setlistsid)** semantics).

### 4.4 `PATCH` coordination

Autosave **[§2](#2-shared-editor-building-blocks-inherit-e7-1-exactly)**; endpoint **`PATCH /api/v1/collections/{id}`** with **field-diff**.

### 4.5 Broken slots

Lazy **`GET /songs/{id}`** yielding **404 / 403**, or hydrated **`not_a_song === true`**, defines **broken** rows (**same UX as setlist§4.5**):

- Badge (“Unavailable”), **Remove** active, reorder allowed.

- **`songs`** dirty + any broken ⇒ **autosave paused** + **§2.5** error banner **“Remove unavailable songs to keep saving”** (**Retry hidden**).

### 4.6 Reorder — `@dnd-kit`

**Exactly E7.1 §4.6:** **`@dnd-kit/core`** + **`sortable`** + **`modifiers`** (`restrictToVerticalAxis`, `restrictToParentElement`) + **`utilities`** — pointer handle + **grab-focus keyboard** (**Space**, arrows, drop, Esc). **Live region announcements** (“Picked up…”, saving gate). **`No`** separate Move up/down row buttons (`block_input` gating unchanged).

Optimistic reorder; PATCH failure ⇒ **rollback** + **§2.5 Retry/Discard** — **never** silently toast-save failures (**toasts**: non-blocking only).

### 4.7 Add — bottom-drawer picker

**Mirrors setlist§4.7:** single drawer (**phone/tablet/desktop**), **flush before open**, **`GET /songs?q=…`**, **300 ms debounce**, **`AbortController`**, **`sort=relevance`** when **`q`** non-empty, exclude **`not_a_song`** client-side , **duplicate badge `Already in collection (×N)`**, taps still append (**no confirm**), **closes after insert**, **`Add`** waits on **`block_input`** if drawer opened during flight (**search may still run**).

### 4.8 Cmd-K insert

When route **`/collections/:id`** and **write-capable**: **Insert song** palette mode (**inline results**, **Enter inserts**, **reuse shared hook**) — parity with **E7.1 §4.8**.

### 4.9 Remove

**Swipe-to-delete**, pointer hover delete control, **`~5 s` undo snackbar** (single stack) — parity with **setlist**.

### 4.10 Play

**No Play control in the editor in E7.2.**

### 4.11 Move / delete collection

Long-press / list only — not in-editor chrome.

### 4.12 Phone layout / `cover`

Sticky title area + scroll (**same as setlist §4.12 in [E7.1](./epic-e7.1-action-plan.md#4-setlist-editor-screen-setlistsid)**). **Cover:** if editable, participates in PATCH diff; hidden fields keep server default (**`""`**).

---

## 5. TanStack Query

**Mirror [E7.1 §5 — TanStack Query (setlists)](./epic-e7.1-action-plan.md#5-tanstack-query-setlists):**

1. **`setQueryData`** with **`PATCH`** response — avoid extra **`GET`**.
2. **Invalidate** **`['collections', …]`** hub infinite lists — partial key **`[...hubListRootKey, 'collections']`**; **`invalidateQueries`** with **`refetchType: 'none'`** identical discipline.
3. **Canonical detail key** — e.g. **`['collectionDetail', id]`** — document in **`api-integration.md`** when landed.

---

## 6. Tests (**required** parity)

**Vitest suites required for exit** (patterns from **E7.1 §6**):

1. **`SongLink[]` helpers:** move / insert / remove / optimistic apply covering **`nr`** + duplicate ids.
2. **Autosave coordinator tests** parameterized or duplicated for **`PATCH`** collection shape — debounce / flush triggers / **`block_input`** / coalesce / **`Retry-After`** / offline resume path.
3. **Broken-slot gate** computation.
4. **Field-diff** builder for **`title` / `cover` / `songs`** vs last server baseline.

Optional component smoke; **no E10 Playwright**.

---

## 7. Documentation (this phase)

1. **`pages-and-flows.md`** / **`app-shell.md`:** Document **collections** parity with **E7.1** — **tap → `/player`**; editor **without Play** until **E8**; **`+`** create dialog; **`return_to`** drop.
2. **Cross-link:** [E7.3](./epic-e7.3-action-plan.md).

---

## 8. Exit checklist (manual)

Everything in **[E7.1 §8](./epic-e7.1-action-plan.md#8-exit-checklist-manual)**, substituted for **`collection`** semantics, plus **`nr`** authoring and (**if shipped**) **`cover`** diff correctness.

Explicit checks:

1. **`/collections/:id`**: autosave/read-only/offline mirror **§2**.
2. **Picker + Cmd-K** reuse shared hook (**§4.7–4.8**).
3. **DnD**: pointer + **keyboard grab-focus**, **no standalone move buttons**.
4. **Failures**: **Retry/Discard**, **no toast** for save PATCH errors.
5. **Hub tap** ⇒ **`/player`**, **`Edit`** ⇒ editor, **`Create`** ⇒ dialog POST only.
6. **Logged-out** editor deep link ⇒ **`/collections`** bounce.
7. **EN + DE** keys under **`collections.*`**.
8. **Required Vitest** green (**§6**).

When **E7.2** passes, continue **[E7.3](./epic-e7.3-action-plan.md)**.

---

## Related docs

- [Epic E7 index](./epic-e7-action-plan.md)
- **[Epic E7.1](./epic-e7.1-action-plan.md)** (normative UX source)
- [Setlist editor](./setlist-editor.md)
- [Epic E2 action plan](./epic-e2-action-plan.md)
