# Epic E7.3 — Song editor + ChordEngine (WASM)

**Parent:** [E7 — Content editors](./roadmap.md#e7--content-editors-collections-songs-setlists) · [E7 phase index](./epic-e7-action-plan.md)

**E6 (songs):** Import/export for songs is specified in [Epic E6](./epic-e6-action-plan.md) (editor + hub). Setlist/collection export remains E6-deferred per [E7 §0](./epic-e7-action-plan.md#0-skipping-e6--scope-adjustments).

**Prerequisite:** [E7.2](./epic-e7.2-action-plan.md) complete.

**Normative UX:** [song-editor.md](./song-editor.md), [pages-and-flows.md](./pages-and-flows.md), [api-integration.md](./api-integration.md), [architecture.md](./architecture.md), [openapi.json](./openapi.json).

**After this phase:** [E8 — Player](./roadmap.md#e8--player-book-mode)

---

## Outcome

**Song** authoring with ChordPro/WorshipPro **source** + DIN-A4 **preview** via **`ChordEngine`** and chordlib WASM; hub **Edit** + **New song**. Completes roadmap **E7** scope for editors.

## Exit (E7.3) — completes roadmap E7

- **`/songs/:id`** per [song-editor.md](./song-editor.md) and API.
- **`ChordEngine`** port + web WASM adapter — **E8** reuses without duplicating WASM loading.
- **Hub:** **Edit** + **`+`** on **`/songs`**; together with [E7.1](./epic-e7.1-action-plan.md)–[E7.2](./epic-e7.2-action-plan.md), **all three** entities have editors and create flows.
- **Song import/export** per [E6](./epic-e6-action-plan.md) (not part of E7.3 exit; ships with E6).

---

## 1. ChordEngine port and WASM

1. **`ChordEngine`** per [architecture.md](./architecture.md): port + adapter with **dynamic `import()`** of the chordlib package.
2. Align methods with **real** wasm-bindgen exports: parse, **DIN-A4 HTML** render, helpers for **source ↔ structured** consistency with [song-editor.md](./song-editor.md).
3. **Lazy load** on **`/songs/:id`** (not hub lists); **loading / error / Retry** before editing.
4. Single integration surface for **E8 player**.

---

## 2. Routing

1. Add **`/songs/:id`** (shell + deep links).

---

## 3. Hub integration (songs)

1. **Song list — long-press / context:** **Edit** → **`/songs/:id`**. **Export** (ChordPro / Worship Pro / PDF) ships with [E6](./epic-e6-action-plan.md).
2. **`+` on `/songs`:** **`POST /api/v1/songs`** → **`/songs/{id}`** (same pattern as E7.1/E7.2).
3. **Cmd-K:** Navigate to **song** editors as needed; **no** song-editor-specific Cmd-K behavior ([song-editor.md](./song-editor.md)).
4. **Setlist** Cmd-K insert ([E7.1](./epic-e7.1-action-plan.md)) unchanged.

---

## 4. Song editor (`/songs/:id`)

Per [song-editor.md](./song-editor.md):

1. **Hybrid UI:** source buffer + **`ChordEngine`** A4 preview; both visible on phone default viewport.
2. **Single parse pipeline** for preview and **`PATCH`** payload.
3. **WASM gate:** block typing until ready or retry.
4. **Metadata strip:** subtitle, languages, artists, copyright, tempo, time, default key — document **directive ↔ strip** rule.
5. **`not_a_song`:** read-only.
6. **`PATCH /api/v1/songs/{id}`** with **`data` required** — **full `PatchSongData` snapshot** each flush.
7. **Strict parse before save**; inline or listed errors.
8. **No** blob management in editor v1.
9. **Play** after flush; **move/delete** from list only.

---

## 5. TanStack Query (songs)

Extend prior phases: **songs** list + **`/songs/:id`** detail cache updates after PATCH.

---

## 6. Tests (recommended)

1. **Vitest:** parse-error aggregation, `ChordEngine` mock for UI.
2. Optional: blocked save on parse failure.

---

## 7. Documentation

1. **[pages-and-flows.md](./pages-and-flows.md):** **Song** **Edit** + **New song**; all three hubs aligned; **Play** from editors when E8 lands.
2. **[app-shell.md](./app-shell.md):** **`+`** on `/songs` = **New** | **Import** per [E6](./epic-e6-action-plan.md).

---

## 8. Exit checklist (manual) — full E7

1. **`/songs/:id`:** load, PATCH, read-only/offline per spec.
2. **Song:** preview/source sync, WASM failure UX, PATCH snapshots, metadata rule.
3. **`ChordEngine`** ready for **E8**.
4. **Hub:** **Edit** + **+** for **songs**; all three entity types covered (E7.1–E7.3).
5. **i18n** EN + DE for **song** editor (setlist + collection done earlier).

When E7.3 passes, **E7 is complete** — proceed to [E8 — Player](./roadmap.md#e8--player-book-mode).

---

## Related docs

- [Epic E7.1](./epic-e7.1-action-plan.md) · [Epic E7.2](./epic-e7.2-action-plan.md)
- [Song editor](./song-editor.md)
- [Setlist editor](./setlist-editor.md)
- [API integration](./api-integration.md)
- [Architecture](./architecture.md)
