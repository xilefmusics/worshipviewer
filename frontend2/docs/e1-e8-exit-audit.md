# E1–E8 exit audit matrix

**Purpose:** Track pass/fail for epic exit criteria after the [E1–E8 completion plan](./epic-e1-e8-completion-plan.md) implementation pass.

**Automated baseline (2026-05-22):**

| Check | Result |
|-------|--------|
| `pnpm -C frontend2 test` | **Pass** (242 tests) |
| `pnpm -C frontend2 typecheck` | **Fail** — pre-existing editor/schema typing debt (unrelated to view-mode/Duplicate) |
| `pnpm -C frontend2 lint` | **Fail** — pre-existing ESLint issues |
| `pnpm -C frontend2 build` | **Fail** — blocked by typecheck |
| Frontend CI workflow | **Added** — [`.github/workflows/frontend-ci.yml`](../../.github/workflows/frontend-ci.yml) |

## Code deliverables (this pass)

| Item | Status |
|------|--------|
| E2 list/card toggle + persistence | **Done** — `hub-view-mode.ts`, `useHubViewMode`, `HubViewModeToggle`, Vitest |
| E7 hub Duplicate (setlists/collections) | **Done** — `duplicate-hub-entity.ts`, context menu, Vitest |
| E2 command registry | **Done** — `commands/hub-commands.ts` |
| E2 haptics on long-press | **Done** — `useLongPress.ts` |
| E8 navigation helpers | **Done** — `buildPlayerSearch`, `emptyEditorReturnSearch`, hub route fixes |
| Docs + offline sign-off engineer row | **Done** — see linked docs |

## Manual QA checklist (device matrix)

Run on **one phone**, **one tablet + keyboard**, **one desktop** after deploy:

### E2 — Hub lists

- [ ] `/` → `/collections`
- [ ] List/card toggle on each hub tab; reload preserves preference
- [ ] Long-press: Edit, Play, Delete, Export; **Duplicate** on setlists/collections
- [ ] Cmd-K Navigate reaches all destinations

### E4 — Offline rehearsal

- [ ] Full [offline-rehearsal.md](./offline-rehearsal.md) script steps 1–9
- [ ] QA sign-off row completed

### E8 — Player §14

- [ ] §14.1 Plumbing (auth `return_to` with `/player?type=setlist&id=…`)
- [ ] §14.2 Book-mode (5 rows)
- [ ] §14.3 Editor Play (5 rows)
- [ ] §14.4 Offline/a11y/edge (8 rows)
- [ ] §14.5 i18n + docs + Vitest in CI (3 rows)

## Related

- [Roadmap](./roadmap.md)
- [Epic E8 action plan §14](./epic-e8-action-plan.md)
