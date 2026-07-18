# Frontend error UX taxonomy

How API failures surface in the SPA. Stable machine codes are defined in [`shared/src/error/codes.rs`](../../shared/src/error/codes.rs); wire shape is [`Problem`](../../docs/openapi.json) (RFC 9457). Parsing helper: [`frontend/app/src/api/problem.ts`](../../frontend/app/src/api/problem.ts).

**Note:** `Problem.title` and `detail` from the API are **English** today. Mapping them through i18n is user-facing work (action plan **1.11**); this doc describes current behavior.

## UI surfaces

| Surface | When used | Examples |
|---------|-----------|----------|
| **Toast** (`sonner`) | Transient action failure or success follow-up | Move song failed, add-to-setlist, duplicate, export started |
| **Inline / field** | Form validation before submit or parse errors in editor | Login email field, ChordPro parse block in song editor |
| **Offline banner** | Network unavailable while editing | Song/setlist/collection autosave paused ([`use*Autosave`](../../frontend/app/src/hooks/)) |
| **Disabled control** | Preconditions not met | Import/export when offline; picker excludes broken slots |
| **Redirect + clear** | Auth/session invalid | 401 → login; [`clearAllLocalData`](../../frontend/app/src/lib/clear-local.ts) on logout (**A4**) |
| **Hub retry UI** | List fetch failed | [`EntityListView`](../../frontend/app/src/components/hub/EntityListView.tsx) error state with retry |
| **Dialog error text** | Mutation inside modal | Create team/collection/setlist dialogs after `parseProblemResponse` |

There is **no central Problem→UI mapper**; call sites choose surface ad hoc. Prefer toast for destructive/ async actions and inline for form context.

## Problem `code` → typical handling

| HTTP | `code` | Typical UI | Notes |
|------|--------|------------|-------|
| 401 | `unauthorized` | Redirect to login; clear local data on session invalidation | |
| 403 | `forbidden` | Toast or dialog error | Team ACL, admin-only routes |
| 404 | `not_found` | Toast; row may disappear on refresh | Broken slot refs return 200 with gate UI instead |
| 400 | `invalid_request` | Inline or toast | Validation, bad JSON body |
| 400 | `invalid_page_size` | Rare in SPA (defaults used) | List param validation |
| 409 | `conflict` | Toast | Duplicate slug/title where applicable |
| 412 | `precondition_failed` | Autosave conflict (future **5.5** ETag) | |
| 406 | `not_acceptable` | Rare | Accept header mismatch |
| 429 | `too_many_requests` | Toast | Auth and API rate limits |
| 5xx | `internal` | Toast + hub retry | Generic server error |

Player Room joins treat an AV `409 conflict` as a return to the chooser with AV disabled. Closed, expired, or invalid public invitations all render the same terminal “Player Room has ended” state. A lost socket preserves the last snapshot, marks controls unavailable, and reconnects with bounded backoff.

## Representative call sites

| Area | File | Pattern |
|------|------|---------|
| Hub delete failure | `e2e/hub-lists.spec.ts` (**L5**) | Toast; row retained |
| Move song | `move-songs.spec.ts` (**F1**) | Toast on API failure |
| Autosave | `useSongAutosave.ts`, `useSetlistAutosave.ts`, `useCollectionAutosave.ts` | Offline banner; `parseProblemResponse` on 4xx |
| Add to setlist | `AddSongToSetlistDialog.tsx` | Toast; maps `alreadyInSetlist` info |
| Join invitation | `routes/join.tsx` | Inline error from Problem |
| Cover upload | `api/team-cover-upload.ts` | Throws with Problem title |

## Related docs

- Search/list failures: [`search-contract.md`](search-contract.md)
- Server Problem construction: [`../business-logic-constraints/http-contract.md`](../business-logic-constraints/http-contract.md)
