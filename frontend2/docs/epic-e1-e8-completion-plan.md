# Action plan: 100% E1–E8 completion

**Purpose:** Close every remaining gap to full **exit** on epics **E1 through E8** per [roadmap.md](./roadmap.md).

**Note:** The roadmap has no **E0** — the chain starts at **E1**. This plan covers **E1–E8** only (not E9 Sync/Tauri or E10 production polish).

**Related:** [roadmap.md](./roadmap.md) · [offline-rehearsal.md](./offline-rehearsal.md) · [epic-e8-action-plan.md](./epic-e8-action-plan.md)

---

## Where you are today

| Epic | Code | Exit sign-off |
|------|------|---------------|
| E1 | ✅ Done | Re-verify (regression) |
| E2 | ✅ Done | List/card toggle + persistence shipped |
| E3 | ✅ Done | Re-verify |
| E4 | ✅ Done | Manual rehearsal — engineer row filled; QA pending |
| E5 | ✅ Done | Re-verify |
| E6 | ✅ Done (roadmap scope) | Re-verify export/import |
| E7 | ✅ Done | Hub Duplicate shipped |
| E8 | ✅ Done (code) | Manual §14 + CI workflow; typecheck debt remains |

**Estimated effort:** ~3–5 dev days code/docs + ~1–2 days QA pass.

---

## Phase 0 — Baseline audit (half day)

Create a single tracking issue or PR checklist. Run these in parallel:

1. `pnpm -C frontend2 test && pnpm -C frontend2 typecheck && pnpm -C frontend2 lint && pnpm -C frontend2 build`
2. Walk [epic-e1-action-plan.md §11](./epic-e1-action-plan.md), [epic-e2 §8](./epic-e2-action-plan.md), [offline-rehearsal.md](./offline-rehearsal.md), [epic-e8 §14](./epic-e8-action-plan.md) — mark each row pass/fail.
3. Record failures only; don’t fix yet.

**Done when:** You have a pass/fail matrix per epic exit criterion.

---

## Phase 1 — Code gaps (1–2 days)

### 1.1 E2: List/card toggle + persistence **(required)**

**Spec:** [app-shell.md §Lists](./app-shell.md), [epic-e2 §3.6](./epic-e2-action-plan.md).

| Step | Task |
|------|------|
| 1 | Extend `hub-view-mode.ts`: `readHubViewMode(entity)`, `writeHubViewMode(entity, mode)`, storage key e.g. `wv.hub.viewMode.{entity}` |
| 2 | Add `useHubViewMode(entity)` hook (read on mount, persist on change) |
| 3 | Wire `EntityListView` to the hook instead of `getDefaultViewMode()` only |
| 4 | Add toggle control in hub chrome (header or list toolbar): icon/button **List \| Card** per active hub tab |
| 5 | Skeleton + empty states must respect active mode |
| 6 | Vitest: storage round-trip + default fallback when key missing |
| 7 | i18n EN+DE: `hub.viewMode.list`, `hub.viewMode.card`, `hub.viewMode.toggleAria` |

**Verify:** Toggle songs/setlists ↔ list/card and collections ↔ list/card; reload → preference survives.

---

### 1.2 E7: Hub Duplicate for setlists & collections **(required)**

**Spec:** [epic-e7.1 §3](./epic-e7.1-action-plan.md), [epic-e7.2 §3](./epic-e7.2-action-plan.md). i18n already has `hub.actions.duplicate`, `collections.hub.duplicate*`.

| Step | Task |
|------|------|
| 1 | Add `lib/duplicate-hub-entity.ts`: `duplicateSetlist(id)`, `duplicateCollection(id)` — `GET` detail → `POST` new with title `"${title} (copy)"` / `collections.hub.duplicateTitleSuffix`, copy `songs`/`SongLink[]`, same `owner` |
| 2 | Context menu row in `EntityListView` for `setlists` and `collections` only (not songs unless API adds support) |
| 3 | Offline guard (same as delete); toast on success; invalidate list query; optional navigate to new editor |
| 4 | Vitest: title suffix helper, payload shaping |
| 5 | Add setlist i18n keys if missing (`setlists.hub.duplicateFailed`) |

**Verify:** Long-press → Duplicate → new entity appears; permissions respected.

---

### 1.3 E2 polish **(recommended for strict 100%)**

| Item | Task | File(s) |
|------|------|---------|
| Command registry | Extract Navigate/Actions items from `CommandPalette.tsx` into `src/commands/hub-commands.ts` (+ register pattern per [app-shell.md](./app-shell.md)) | new `commands/`, `CommandPalette.tsx` |
| Haptics | `navigator.vibrate(10)` in `useLongPress` on menu open (try/catch, no-op on iOS) | `useLongPress.ts` |

---

### 1.4 E8 fixes from Phase 0 failures **(as needed)**

Only implement what the §14 checklist fails. Likely areas to watch:

| Checklist row | What to confirm in code |
|---------------|---------------------------|
| §14.1.3 | Logged-out `/player?...` → `/login?return_to=...` → back to player after auth (`auth-guard.ts` + login redirect) |
| §14.1.4 | No stray `URL.createObjectURL` outside `useBlobUrl` / `resolve-blob-url.ts` |
| §14.4.17 | Eviction grace: second tab evicts mirror; first tab shows `player.evicted`, nav disabled |
| §14.4.19 | `ChordsSlide` error + Retry (already present — verify UX) |
| §14.4.22 | TOC focus trap + reduced-motion drawer |

---

## Phase 2 — CI gate for E8 exit (half day)

**Spec:** [epic-e8 §14.5.25](./epic-e8-action-plan.md) — Vitest green **in CI**.

Add `.github/workflows/frontend-ci.yml`:

```yaml
# on: pull_request + push to main
# steps: pnpm install, build:wasm (or cache pkg), test, typecheck, lint, build
```

**Done when:** PR checks run `pnpm -C frontend2 test` and pass.

---

## Phase 3 — Documentation & sign-off (half day)

### 3.1 E8 doc merge ([epic-e8 §13](./epic-e8-action-plan.md))

| Doc | Action |
|-----|--------|
| [pages-and-flows.md](./pages-and-flows.md) | Remove any stale “E2 no-op tap” history if still present |
| [setlist-editor.md](./setlist-editor.md) / [song-editor.md](./song-editor.md) | Confirm Play/flush wording matches implementation |
| [architecture.md](./architecture.md) | Ensure eviction grace + `touchSetlistPlayerOpened` paragraph is accurate |
| [roadmap.md](./roadmap.md) | E8 exit bullets reflect completed state |
| [grill-session.md](./grill-session.md) | Add **E8 interactive grill** subsection for any shortcuts/breakpoints decided in code |
| [offline-rehearsal.md](./offline-rehearsal.md) | Fill sign-off table (Engineer + QA + date) |

### 3.2 E6 doc hygiene

Update [plan.md](./plan.md) decision log line about “setlist/collection export deferred” — export is implemented.

---

## Phase 4 — Epic-by-epic verification (1–2 days QA)

Run each checklist **after** Phase 1–2 land. Use one phone, one tablet with keyboard, one desktop.

### E1 — Foundation (regression)

From [epic-e1 §11](./epic-e1-action-plan.md):

- [ ] Unauthenticated → `/login`; OAuth + OTP tabs work
- [ ] `return_to` allowlist (include `/player?type=setlist&id=…`)
- [ ] Logout + simulated 401 → Query + Dexie cleared
- [ ] `?lang=en|de` + persistence
- [ ] Branding checklist in [branding.md](./branding.md) still true

*Note: `/` stub is intentionally superseded by E2 redirect — that’s correct.*

---

### E2 — Hub lists

From [epic-e2 §8](./epic-e2-action-plan.md) — **updated for post-E8 reality**:

- [ ] `/` → `/collections`
- [ ] Three hubs: pagination, search debounce, pull-to-refresh, load-more, empty vs no-results
- [ ] **Card/list toggle persists** ← Phase 1.1
- [ ] Primary tap → `/player` (expected after E8, not E2 no-op)
- [ ] `+` opens create/import flows (not no-op)
- [ ] Profile + Cmd-K navigate to Settings/Teams/Sessions/Install
- [ ] Long-press: Edit, Play, Delete, Export; Duplicate for setlists/collections
- [ ] Cmd-K trap-focus on desktop

---

### E3 — PWA

From [roadmap E3](./roadmap.md) + [pwa-install.md](./pwa-install.md):

- [ ] Manifest icons (192, 512, maskable), `theme_color`, standalone
- [ ] iOS install sheet; Android `beforeinstallprompt`
- [ ] Update toast → reload
- [ ] SW: precache + navigate fallback only; no `/api/*` runtime cache
- [ ] Install hidden when already standalone / fragile IDB

---

### E4 — Offline + Settings

From [roadmap E4](./roadmap.md) + [offline-rehearsal.md](./offline-rehearsal.md):

- [ ] Full rehearsal script steps 1–9
- [ ] Sign-off table completed
- [ ] Settings: language, appearance, cache size + clear

---

### E5 — Teams & sessions

From [roadmap E5](./roadmap.md):

- [ ] Teams list + create; team detail (members, roles, invitations, invite link)
- [ ] `/join?team_id=&invitation_id=` accept flow
- [ ] Sessions list + revoke (not current session without confirm)
- [ ] Cmd-K + profile reach all destinations

---

### E6 — Import/export

From [roadmap E6](./roadmap.md) + [epic-e6-action-plan.md](./epic-e6-action-plan.md):

- [ ] Song editor overflow: Import + Export (3 formats)
- [ ] Hub long-press Export on songs, setlists, collections
- [ ] `/songs` + → New \| Import (multi-file, partial failures)
- [ ] PDF print path non-blocking

*Out of scope for 100% roadmap E6 (explicitly deferred in epic-e6): single merged ChordPro file per setlist/collection; import on setlist/collection hubs.*

---

### E7 — Content editors

From [epic-e7 index](./epic-e7-action-plan.md) and phase checklists:

- [ ] Setlist editor: reorder, autosave, picker, Cmd-K insert, Play flush
- [ ] Collection editor: `nr`, move between collections, cover
- [ ] Song editor: ChordPro source, WASM preview, autosave, import/export
- [ ] Hub **Duplicate** for setlists/collections ← Phase 1.2
- [ ] Read-only + offline banners behave per spec

---

### E8 — Player

From [epic-e8 §14](./epic-e8-action-plan.md) — all 25 rows:

- [ ] §14.1 Plumbing (4 rows)
- [ ] §14.2 Book-mode (5 rows)
- [ ] §14.3 Editor Play (5 rows)
- [ ] §14.4 Offline/a11y/edge (8 rows)
- [ ] §14.5 i18n + docs + **Vitest in CI** (3 rows)

Store results in the tracking issue; link PR that fixes any failures.

---

## Suggested PR order

| PR | Scope | Unblocks |
|----|-------|----------|
| **PR-A** | E2 view-mode toggle + tests + i18n | E2 100% |
| **PR-B** | E7 hub Duplicate (setlist/collection) | E7 100% |
| **PR-C** | E2 polish: command registry + haptics | Strict E2/app-shell |
| **PR-D** | Frontend CI workflow | E8 §14.5.25 |
| **PR-E** | E8 fixes from QA (if any) | E8 100% |
| **PR-F** | Docs + offline-rehearsal sign-off + grill E8 | E4/E8 doc exit |

---

## Definition of done (E1–E8 = 100%)

You can call **E1–E8 complete** when:

1. **All Phase 1 code** is merged (minimum: **1.1 + 1.2**).
2. **Every row** in E1 §11, E2 §8 (updated), offline-rehearsal, E6 spot-check, E7 phase checklists, and E8 §14 is **checked pass**.
3. **Frontend CI** runs Vitest + typecheck + lint + build on every PR.
4. **Docs** match behavior (E8 §13 + rehearsal sign-off).
5. No open **P0/P1** bugs filed against exit criteria.

---

## Out of scope (E9 / E10)

Do **not** block E1–E8 100% on:

- `SyncTransport` / `PlatformCapabilities` / “Paired devices”
- Tauri shell
- Playwright E2E (E10 — though CI Vitest is required by E8)
- Extra locales beyond EN/DE
- E6 “single-file bundle” export variant

---

## Related docs

- [Plan index](./plan.md)
- [Roadmap](./roadmap.md)
- [Epic E1 action plan](./epic-e1-action-plan.md)
- [Epic E2 action plan](./epic-e2-action-plan.md)
- [Epic E6 action plan](./epic-e6-action-plan.md)
- [Epic E7 action plan](./epic-e7-action-plan.md)
- [Epic E8 action plan](./epic-e8-action-plan.md)
- [Offline rehearsal](./offline-rehearsal.md)
