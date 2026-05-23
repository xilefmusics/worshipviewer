# API integration

**OpenAPI:** **Worship Viewer API** v2.

- **Canonical copy in this repo:** [openapi.json](./openapi.json) (OpenAPI 3.0.3).
- **Production URL** (for refresh): `https://app.worshipviewer.com/api/docs/openapi.json`

Prefer generating types from **`docs/openapi.json`** so docs and codegen stay aligned; copy or symlink into `app/` in the implementation phase if tooling expects a path under the Vite app.

**Ownership:** the **frontend team** regenerates TypeScript types and refreshes the typed client when the API version bumps (coordinate in the same PR as spec changes when backend work lands).

## Codegen pipeline

1. **Sync** spec: copy from [docs/openapi.json](./openapi.json) or re-fetch the production URL into `app/` or `packages/api-schema/` as needed.
2. **Generate types**: `openapi-typescript` → `src/api/schema.d.ts` (or `src/api/generated/schema.d.ts`).
3. **Client**: `openapi-fetch` with typed paths/methods; single instance with `baseUrl` from `import.meta.env.VITE_API_BASE_URL` (default `''` for same origin).
4. **Credentials**: `credentials: 'include'` for cookie auth.
5. **CSRF:** Assume **browser cookie policy + server configuration** (e.g. `SameSite`) handle mutating requests; **no extra client CSRF token** unless the backend contract later requires it.

Suggested script name: `pnpm openapi:sync` (fetch + generate).

## Auth

| Flow | Endpoints |
|------|-----------|
| OAuth | `GET /auth/login?return_to=...` → redirect; `GET /auth/callback` handled by server |
| OTP | `POST /auth/otp/request`, `POST /auth/otp/verify` |
| Session | `GET /api/v1/users/me` — hydrate user after login; **revalidate on window/document focus** (and after login), not on every route change |
| Logout | **Always** wipe **all** TanStack Query cache + entire Dexie. **Online:** `POST /auth/logout` as part of sign-out. **Offline:** wipe local immediately; **queue** `POST /auth/logout` when back online (same signed-out UX locally) |

## Pagination (load more, not page numbers)

- Query: `page` (0-based), `page_size` (1–500, default 50).
- Response: `X-Total-Count` header; body is items array (per OpenAPI operation schemas).
- **TanStack Query**: `useInfiniteQuery` with `pageParam = page`.
- **`hasNextPage`**: Prefer `X-Total-Count` vs `loadedCount` when the header is **present and trustworthy**. If the header is **missing**, **assume no further pages** (do not rely on `items.length === page_size` alone for “maybe more” in MVP).
- **UI**: Use an **IntersectionObserver** sentinel near the list bottom to **auto-load** the next page; also provide an explicit **Load more** control as a fallback for accessibility and predictable manual control — not “Page 1 of N”.
- **Pull-to-refresh** (primary entity lists): invalidate / reset to `page=0` and refetch; align with TanStack Query `useInfiniteQuery` reset patterns; **scroll to top** after refresh per [App shell](./app-shell.md).

## Search

- `q` on list endpoints (e.g. songs) — use `sort=relevance` when `q` is non-empty (per `SongListQuery` description).
- Optional filters: `lang`, `tag` for songs.
- **Phone header search:** **~300 ms debounce**; **cancel** the prior request when the query changes (`AbortController`) so rapid typing does not apply stale results.
- **v1 list UI:** Do **not** add separate sort dropdowns or filter chips on list screens; discovery is **header search** (phones) and command palette (tablet/desktop) per [App shell](./app-shell.md). **Command palette** search uses the **same `q` semantics** as list search — no separate omnisearch endpoint in v1. Additional query params stay available for later phases if the product adds explicit filter UI.

## Blob URLs

- `GET /api/v1/blobs/{id}/data` returns binary; use **`useBlobUrl(id)`** hook:
  - **Online:** fetch from network; on success optionally read-through to Dexie mirror for later offline use. **Do not** substitute Dexie for a failed online fetch while the app is online.
  - **Offline:** resolve from Dexie when present; otherwise surface the standard unavailable error.
  - **Blob** → `URL.createObjectURL`; revoke on unmount
  - Integrate with offline cache for player items of type `blob`
  - **Retries:** **no** automatic multi-retry loop — offer **Retry** (manual) on failure. **Large blobs:** show **indeterminate** progress with **cancel**; document a generous upper **timeout** for huge assets.

## Player endpoints

- `GET /api/v1/songs/{id}/player`
- `GET /api/v1/setlists/{id}/player`
- `GET /api/v1/collections/{id}/player`

Response shape: `Player` (items, toc, scroll_type, orientation, index, …).

## TanStack Query keys (subset)

- **Setlist editor:** `GET /api/v1/setlists/{id}` is cached under **`['setlistDetail', id]`** (`setlistDetailKey(id)` in the app). Use the same key for invalidation when a PATCH succeeds and the hub setlists list should stay consistent with passive invalidation patterns.
- **Collection editor:** `GET /api/v1/collections/{id}` is cached under **`['collectionDetail', id]`** (`collectionDetailKey(id)`). Passive hub invalidation for collections lists mirrors setlists (**`invalidateQueries`** with **`refetchType: 'none'`** on `[...hubListRootKey, 'collections']`).

## Feature modules (mutations)

- **Song like**: `GET/PUT/DELETE /api/v1/songs/{id}/like`
- **Move / reorder**: `POST .../move` on songs, setlists, collections, blobs as per spec
- **Teams / invitations**: under `/api/v1/teams/...`

Each feature: small `hooks` + `mutation` with **optimistic updates only where explicitly allowed** — **reorder** (and similar ordering mutations) may be optimistic with rollback; **delete** and other destructive mutations **wait for the server** in v1.

## Error handling

- Map server errors (`Problem` / `ProblemDetails`) **primarily to toasts** in v1; keep **inline** errors for **field validation** and form-level failures where the user is already focused in a form.
- **401** on protected routes → redirect to `/login` and **wipe all TanStack Query cache and entire Dexie** (same local cleanup as logout).
- **Telemetry:** **no** service-worker–specific or offline analytics pipeline in v1 — **basic client error reporting** only (aligns with [tech-stack.md](./tech-stack.md) / grill T6).

## Related docs

- [Architecture](./architecture.md)
- [Roadmap](./roadmap.md)
- [Design grill session](./grill-session.md)
