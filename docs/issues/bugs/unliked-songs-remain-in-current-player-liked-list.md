---
title: "Unliked songs remain in the current player's Liked list"
summary: "When a musician unlikes the current song in the player's Liked view, the unlike is saved but the stale song remains visible in that list."
area: "Player"
status: "fixed"
owner: null
last_reviewed: "2026-08-31"

personas:
  - "musician"
  - "worship leader"
primary_persona: "musician"
environment:
  version: null
  deployment: null
  client: null

severity:
  score: 2
  reason: "The saved like state is correct, but the stale player list is misleading and interrupts navigation; the wider player remains usable."
  scale:
    1: "Cosmetic or negligible"
    2: "Minor inconvenience with an easy workaround"
    3: "Important workflow is impaired"
    4: "Core workflow is blocked or data may be corrupted"
    5: "Security, data loss, or widespread outage"
frequency:
  score: 3
  reason: "The report describes the issue under the specific condition of unliking the current song while using the player's Liked list; occurrence outside that condition is unknown."
  scale:
    1: "Seen once or in a rare edge case"
    2: "Occasional"
    3: "Regular under specific conditions"
    4: "Most attempts"
    5: "Every attempt or continuously"
reproducibility:
  score: 5
  reason: "Reproduced deterministically in the running collection player with a server-loaded liked song, including the stale row before reload and the inconsistent embedded like payload."
  scale:
    1: "Not reproduced"
    2: "Intermittent with unknown trigger"
    3: "Reproduced with incomplete conditions"
    4: "Reliable steps known"
    5: "Minimal deterministic reproduction"
evidence:
  score: 5
  reason: "Confirmed in the running app and covered by component and query-cache regression tests for stale embedded likes, duplicate rows, fresh player objects, rollback, and gesture handling."
  scale:
    1: "Unverified report"
    2: "Single observation"
    3: "Repeated observations or useful diagnostics"
    4: "Confirmed with logs, tests, or repository evidence"
    5: "Failing automated regression test"
effort:
  score: 2
  reason: "The likely change is localized frontend state reconciliation plus a component regression test, on the order of roughly 100 lines."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
fix_risk:
  score: 2
  reason: "The surface is small, but removing the active row must preserve a valid current item and avoid breaking optimistic rollback or duplicate-song entries."
  scale:
    1: "Isolated and reversible"
    2: "Small, well-understood surface"
    3: "Meaningful regression surface"
    4: "Cross-cutting behavior or migration risk"
    5: "Fundamental uncertainty or high blast radius"
---

[← Back to issues README](../Readme.md)

# Bug: Unliked songs remain in the current player's Liked list

## Assessment

Scores are from 1 to 5. Higher means more severe, frequent, reproducible,
well-evidenced, costly, or risky, depending on the category.

| Category | Score | Reason |
|---|:---:|---|
| Severity | 2 / 5 | The saved like state is correct, but the stale player list is misleading and interrupts navigation; the wider player remains usable. |
| Frequency | 3 / 5 | The report describes the issue under the specific condition of unliking the current song while using the player's Liked list; occurrence outside that condition is unknown. |
| Reproducibility | 5 / 5 | Reproduced deterministically in the running collection player with a server-loaded liked song, including the stale row before reload and the inconsistent embedded like payload. |
| Evidence | 5 / 5 | Confirmed in the running app and covered by component and query-cache regression tests for stale embedded likes, duplicate rows, fresh player objects, rollback, and gesture handling. |
| Effort | 2 / 5 | The likely change is localized frontend state reconciliation plus a component regression test, on the order of roughly 100 lines. |
| Fix risk | 2 / 5 | The surface is small, but removing the active row must preserve a valid current item and avoid breaking optimistic rollback or duplicate-song entries. |

## Observed behavior

Unliking the current song persists the unlike, but the song remains visible in the
current player's Liked list. The player therefore presents a list that no longer
matches the user's saved like state.

## Expected behavior

After an unlike succeeds, every row for that song should disappear immediately
from the current player's Liked list. The player should keep a valid current
position, and a failed request should restore the row through the existing
optimistic rollback behavior.

## Reproduction

**Prerequisites**

- An authenticated, online user with permission to use player library actions.
- A player source containing at least one song the user has liked.

**Steps**

1. Open the source in the sheet player.
2. Open the table of contents and select the Liked display mode.
3. Navigate to a liked song and use the player control to unlike it.

**Actual result**

- The unlike is saved, but the song remains in the current player's Liked list.

**Expected result**

- The unliked song is removed immediately from the current player's Liked list.

The defect was reproduced in a collection player on the local web client after
loading a liked song from the server.

## Evidence

- User report: "Unliking a song does unlike it, but does not remove it from the current player like list."
- `frontend/app/src/api/songs-like.ts` sends `DELETE /api/v1/songs/{id}/like` for an unlike and returns without updating or invalidating cached player data.
- `frontend/app/src/components/player/PlayerBook.tsx` keeps server-derived likes and a component-local optimistic delta, merges those values into the TOC, and rolls the delta back only when the request fails.
- `frontend/app/src/lib/player/toc-display.ts` filters the Liked view solely from each merged TOC row's `liked` value.
- Existing TOC tests cover rendering liked rows and pure filtering, but no component test covers unliking the current song while the Liked view is active.

## Workaround

- Reloading the player removed the stale row because the persisted unlike was
  correct, but this interrupted the player workflow.

## Resolution notes

- **Root cause:** Player payloads contain the like in two representations. The
  table of contents had the current authoritative value, while embedded player
  items could retain a default or stale `user_specific_addons.liked` value. The
  frontend initialized from the TOC and then overwrote it with the stale item
  value. Optimistic deltas were also scoped to a `Player` object reference, so
  an equivalent fresh query result could discard them, and successful mutations
  did not reconcile the cached player and song-detail payloads.
- **Fix:** TOC likes now take precedence during initialization. Optimistic state
  is scoped to the stable player resource, every matching TOC/item occurrence is
  reconciled in React Query after success, and failed requests restore the prior
  value without overwriting a newer toggle.
- **Gesture feedback:** Native double-click and touch double-tap paths now avoid
  duplicate synthetic toggles. Liking shows a stronger heart pop; unliking shows
  the inverse shrinking/fading heart so the action is visibly acknowledged.
- **Regression coverage:** Component tests cover a server-liked TOC paired with
  stale embedded item values, duplicate song rows, refreshed player objects,
  failed-request rollback, native double-click, and delayed touch-generated
  clicks. API tests cover cache reconciliation for player and song-detail data.

## Verification

- Reproduced and verified against the running local collection player.
- Confirmed immediate removal from the Liked view and persistence after reload.
- Frontend lint, typecheck, all 815 tests, and the production build pass.
