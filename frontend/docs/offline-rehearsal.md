# Offline MVP rehearsal (E4 exit)

**Purpose:** Manual **airplane-mode** rehearsal before leaving **E4** for **E5**. Automate nothing here — this is a human checklist. Update steps when flows change.

## Preconditions

- Signed in on a **setlist** that has been **opened in the player** at least once while online (so Dexie has a chance to mirror per [architecture.md](./architecture.md)).
- Device: preferably a **phone or tablet** + one **desktop** run for parity.

## Script

1. **Baseline online:** Open the same setlist in the player; confirm playback works; leave the player or return to a hub list.
2. **Go offline:** Enable **airplane mode** or disable all radios so the browser reports **offline**.
3. **Indicator:** Confirm the **offline indicator** appears **near the avatar** and stays until the connection returns.
4. **Emergency playback:** Open the **cached setlist** in the player again — confirm playback proceeds for cached blob/chord items per architecture (graceful handling of any **missing** mirrored piece).
5. **Non-goals:** Attempt a **song** or **collection** player offline — expect the **online-only** error path (MVP).
6. **Create / edit:** Confirm **create** and **writes** are **disabled** or blocked with a clear message while offline.
7. **Settings:** Open **`/settings`** — verify **cache size** (or equivalent) and **clear cache** behave without crashing while offline where supported.
8. **Return online:** Disable airplane mode — confirm indicator clears; open the same setlist player and confirm **fresh fetch** path works (`GET .../player` authoritative when online).
9. **Eviction (optional if time):** Trim cache / lower budget / clear other data per docs — confirm **grace** behavior when advancing within a playing setlist (finish current item, then block if evicted).

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|--------|
| Engineer | E1–E8 completion pass | 2026-05-22 | Code + Vitest for hub view-mode, Duplicate, CI workflow; manual steps 1–9 still require device rehearsal. |
| QA / product | _pending_ | | Run script on phone/tablet + desktop after merge. |

## Related docs

- [Architecture](./architecture.md) — offline MIR, LRU, eviction grace
- [Roadmap](./roadmap.md) — E4 exit
- [Design grill session](./grill-session.md)
