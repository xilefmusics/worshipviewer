# Epic E7 — phase index (content editors)

**Epic:** [E7 — Content editors (collections, songs, setlists)](./roadmap.md#e7--content-editors-collections-songs-setlists)

Execution is split into **three** step-by-step files (setlist → collection → song) so WASM lands last.

| Phase | Document | Scope | Wasm / ChordEngine |
|--------|-----------|--------|---------------------|
| **E7.1** | [epic-e7.1-action-plan.md](./epic-e7.1-action-plan.md) | **Setlist** — `/setlists/:id`, hub (**tap** → player, **Edit** via long-press, **`+`**, Cmd-K insert) | **None** |
| **E7.2** | [epic-e7.2-action-plan.md](./epic-e7.2-action-plan.md) | **Collection** — `/collections/:id`, collection hub; `SongLink` + **`nr`** | **None** |
| **E7.3** | [epic-e7.3-action-plan.md](./epic-e7.3-action-plan.md) | **Song** — `/songs/:id`, song hub; **`ChordEngine`** + chordlib WASM | **Required** |

**Order:** Two list-based editors on **REST + TanStack** only, then song + WASM.

**Prerequisites:** E1–E5 per [roadmap](./roadmap.md).

**Normative UX (all phases):** [setlist-editor.md](./setlist-editor.md), [song-editor.md](./song-editor.md), [pages-and-flows.md](./pages-and-flows.md), [api-integration.md](./api-integration.md), [architecture.md](./architecture.md), [openapi.json](./openapi.json).

Within each phase file, execute steps in order unless that file says otherwise.

---

## 0. Skipping E6 — scope adjustments

Without **E6**, the following remain **out of scope** for **E7.1–E7.3** (add when E6 returns):

| Topic | Deferred behavior |
|--------|-------------------|
| **Long-press Export** | **Songs:** [E6](./epic-e6-action-plan.md). **Setlists / collections:** still deferred until E6 extends to those entities. |
| **+ → Import** | **Songs hub:** [E6](./epic-e6-action-plan.md) chooser. Other hubs: **`+`** = **New** only until E6. |
| **Roadmap E7 exit** | **Song** export/import is **E6**, not E7.3. |

**Dependency rationale:** Formal roadmap order is E6 → E7. Skipping E6 is a **planning exception**; phased delivery still yields shippable increments.

**Depends on:** E6 (or **E5 + explicit E6 deferral** — this §0).

---

## Roadmap E7 exit (all phases done)

Satisfied when **[E7.3](./epic-e7.3-action-plan.md)** exit is met — see [roadmap E7](./roadmap.md#e7--content-editors-collections-songs-setlists).

---

## Related docs

- [Roadmap](./roadmap.md)
- [Epic E2 action plan](./epic-e2-action-plan.md) (list/shell baseline)
