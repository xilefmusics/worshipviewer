# E2E test coverage inventory

Playwright suite under [`frontend/app/e2e/`](../../frontend/app/e2e/). Flow catalog source of truth: [`../architecture/frontend-user-flows.md`](../architecture/frontend-user-flows.md). Every flow id **A1–L5** must be referenced by [`lint-flow-coverage.mjs`](../../frontend/app/scripts/lint-flow-coverage.mjs) (CI: `pnpm lint:flows`).

## Running locally

```bash
cd frontend && pnpm e2e:install && pnpm test:e2e
```

Real backend on port **8788** via [`serve-backend.mjs`](../../frontend/app/e2e/serve-backend.mjs). **Not in CI** — intentional deferral (action plan **2.1**, **6.1**).

## Playwright projects

From [`playwright.config.ts`](../../frontend/app/playwright.config.ts):

| Project | Specs | Device |
|---------|-------|--------|
| `chromium` | All except `mobile-viewport`, `pull-refresh` | Desktop Chrome |
| `iphone` | `mobile-viewport`, `pull-refresh` | iPhone 14 |
| `ipad` | `mobile-viewport` only | iPad Pro 11 |

Global: `serviceWorkers: 'block'` — PWA install/update path **not** covered (**2.25** deferred).

## Flow ↔ spec matrix

| Flow | Description (short) | Primary spec | Notes |
|------|---------------------|--------------|-------|
| A1 | Email OTP login | `auth.spec.ts` | |
| A2 | Google sign-in | `auth.spec.ts` | Mock/stub path |
| A3 | Redirects / 404 | `auth.spec.ts` | |
| A4 | Logout clears data | `auth.spec.ts` | |
| A5 | Join invitation | `auth.spec.ts` | |
| B1–B6 | Teams CRUD, invite, cover | `teams.spec.ts` | |
| C1–C3 | Collections | `collections.spec.ts` | |
| D1–D6 | Songs create/import | `songs.spec.ts` | D5 import execute |
| E1–E6 | Setlists | `setlists.spec.ts` | E4 desktop-only; E5 key picker |
| F1–F2 | Move / add songs | `move-songs.spec.ts` | F1 failure toast |
| G1–G2 | Song editor | `editors.spec.ts` | Offline paused |
| H1–H4 | Player normal | `player-normal.spec.ts` | H3/H4 smoke-level keys |
| I1–I3 | Player AV | `player-av.spec.ts` | Projection window |
| J1–J3 | Settings | `settings.spec.ts` | Round-trip persistence test |
| K1 | Sessions | `sessions.spec.ts` | Pagination |
| L1 | Browse / scroll / refresh | `hub-lists.spec.ts`, `pull-refresh.spec.ts`, `offline.spec.ts` | Pull refresh: iphone only |
| L2–L5 | Hub row actions | `hub-lists.spec.ts` | L4 export toast; L5 delete guard + API fail |

## Supplementary specs (no dedicated flow id)

| Spec | Purpose |
|------|---------|
| `a11y-smoke.spec.ts` | `@axe-core/playwright` on login, hub, player |
| `command-palette.spec.ts` | Meta+k, coarse-pointer search field |
| `mobile-viewport.spec.ts` | Hub + player rotation smoke |
| `offline.spec.ts` | Hub offline rows, player not-cached |
| `hello-world.spec.ts` | Harness sanity |

## Known gaps

| Gap | Owner / tracking |
|-----|------------------|
| PDF / print export | No e2e; unit/iframe tests in `song-import-export*.test.ts` (**6.6**) |
| PWA install / SW update | Blocked by `serviceWorkers: 'block'` (**2.25**) |
| Player keyboard depth | H4/I1 key assertions thin vs unit tests |
| About route (**M** flows) | Not in A–L catalog yet (**5.6**) |
| CI enforcement | Local-only (**6.1**) |

## Maintenance

When adding a flow to `frontend-user-flows.md`:

1. Add `// Flow: Xn` comment or `test('Xn: …')` title in an e2e spec.
2. Run `pnpm lint:flows`.
3. Update this matrix.
