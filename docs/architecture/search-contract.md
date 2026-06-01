# Search contract (API and client)

This document ties together server-side list search (`q`) and how the SPA consumes it. Canonical server rules live in [`../business-logic-constraints/list-pagination.md`](../business-logic-constraints/list-pagination.md) (**BLC-LP-003**); this file adds cross-surface client semantics.

## Server contract (`q`)

All paginated list routes accept optional **`q`**. Whitespace-only values are treated as absent (**BLC-LP-005**). Filtering runs before pagination (**BLC-LP-009**).

| Route | `q` semantics |
|-------|---------------|
| `GET /songs` | Full-text on titles, artists, lyrics; titles also match case-insensitive **substring** |
| `GET /collections`, `GET /setlists` | Full-text on **title** + case-insensitive title substring |
| `GET /teams` | Full-text on **name**; substring on team id, personal owner email, member emails |
| `GET /users` (admin) | Substring on email or user id |
| `GET /users/me/sessions`, `GET /users/{id}/sessions` | Substring on session id, user id, user email |
| `GET /blobs` | OCR substring (case-insensitive) |

Song lists also accept **`sort`**, **`lang`**, and **`tag`** query params — see [`shared/src/api/song_list_query.rs`](../../shared/src/api/song_list_query.rs) and [`../business-logic-constraints/song.md`](../business-logic-constraints/song.md).

## Client surfaces

| Surface | Mechanism | Semantics |
|---------|-----------|-----------|
| **Hub lists** (songs, collections, setlists, teams, sessions) | [`HubSearchProvider`](../../frontend/app/src/context/HubSearchProvider.tsx) debounces input **300 ms**, passes `debouncedQ` to [`list-fetch.ts`](../../frontend/app/src/api/list-fetch.ts) as `q` | **Server-side** — same as BLC-LP-003 for the active route |
| **Entity pickers** (setlist/collection add-song sheets) | Local filter over already-fetched rows or dedicated list fetch with `q` | Server `q` when paginated fetch; otherwise client title match on loaded page |
| **Player TOC** | [`toc-filters.ts`](../../frontend/app/src/lib/player/toc-filters.ts) filters loaded **TOC metadata** (language, tags) | **Client-only** — does **not** call list APIs; unrelated to hub `q` |
| **Command palette** | Fuzzy match on hub entities already in memory / navigation targets | **Client-only** — not list `q` |

When implementing new search UI, pick the column above explicitly. Do not assume hub debounced `q` behavior applies inside the player.

## Pagination

- **Today:** SPA uses **`X-Total-Count`** and page index; detects last page when `items.length < page_size` or empty page (**BLC-LP-008**).
- **Server also emits:** RFC 5988 **`Link`** header (`first` / `prev` / `next` / `last`) with the same query shape (**BLC-LP-010**). The SPA **does not consume** `Link` today (future work: action plan **5.12**).

## Related docs

- Error presentation for failed list/search requests: [`frontend-error-ux.md`](frontend-error-ux.md)
- Hub offline behavior (cached rows vs live search): [`frontend-user-flows.md`](frontend-user-flows.md) § L1
