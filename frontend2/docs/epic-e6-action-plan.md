# Epic E6 — Library import and export (songs v1)

**Epic:** [E6 — Library import and export](./roadmap.md#e6--library-import-and-export)

**Normative UX:** [song-editor.md](./song-editor.md), [app-shell.md](./app-shell.md), [pages-and-flows.md](./pages-and-flows.md), [architecture.md](./architecture.md).

**Prerequisite:** [E5 — Teams and sessions](./roadmap.md#e5--teams-and-sessions-management) complete.

**After this phase (songs v1):** Continue E6 for setlists/collections export bundling, or proceed to dependent work per [roadmap](./roadmap.md).

---

## Outcome (songs v1)

Users can **round-trip** worship song files for **songs**: **export** from the **song editor** and **songs hub** as **PDF**, **ChordPro**, or **WorshipPro**; **import** ChordPro/WorshipPro from the **editor** (replace source) or **batch** from the hub **`+`** chooser (**New** vs **Import**).

## Exit (E6 songs v1)

- **`/songs/:id`:** overflow menu **Import** + **Export** (ChordPro, Worship Pro, PDF) per [song-editor.md](./song-editor.md#import--export).
- **`/songs` list:** long-press / context menu includes **Export** (three formats).
- **`+` on `/songs`:** chooser **New song** | **Import files** (multi-select ChordPro/WorshipPro); partial failures reported clearly.
- **PDF:** `renderA4Html` → isolated frame → **browser print** (Save as PDF); real selectable text; non-blocking.
- **i18n:** EN + DE for new strings.

## Deferred (full E6)

| Topic | Notes |
|--------|--------|
| **Setlist / collection export** | Same format choices; bundling vs multiple files per API constraints |
| **Hub import on collections/setlists** | Songs hub only in v1 |

---

## 1. Song editor (`/songs/:id`)

Per [song-editor.md](./song-editor.md#import--export):

1. **Overflow menu** in the sticky tab bar (⋯): **Import file**, **Export** submenu (ChordPro, Worship Pro, PDF).
2. **Import** replaces the ChordPro source buffer; confirm when autosave has **pending** edits.
3. **Export** uses current parse result when valid, else server `data`; chord spelling follows user format preference.
4. **Read-only:** export allowed; import disabled.
5. **Offline:** import disabled; text and PDF export allowed from cached data once WASM is loaded.

---

## 2. Songs hub list

1. **Context menu** on song rows: **Export** → ChordPro | Worship Pro | PDF (after **Play**).
2. **`+` FAB:** opens **chooser** sheet → **New song** (existing `CreateSongDialog`) or **Import files** (`ImportSongsDialog`).
3. **Batch import:** `POST /api/v1/songs` per file after WASM parse; team picker when multiple writable teams.
4. **Permissions:** import/create require writable team library; export works for readable songs.

---

## 3. Shared implementation

1. **`ChordEngine`** via `getChordEngine()` — lazy load on first import/export from hub list.
2. **`song-import-export.ts`:** parse, format, download, PDF generation, batch POST orchestration.
3. **Vitest** for pure helpers (basename, batch aggregation).

---

## 4. Documentation updates

1. [song-editor.md](./song-editor.md) — Import / export section.
2. [epic-e7.3-action-plan.md](./epic-e7.3-action-plan.md) — cross-link E6 (hub export no longer deferred for songs).
3. [pages-and-flows.md](./pages-and-flows.md) — `/songs` chooser, editor I/O.

---

## Related docs

- [Roadmap E6](./roadmap.md#e6--library-import-and-export)
- [Epic E7.3](./epic-e7.3-action-plan.md)
- [App shell](./app-shell.md)
