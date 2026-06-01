# Business logic constraints for the collection resource

## Static

- **BLC-COLL-001:** Every collection belongs to exactly one **owning team** (**`owner`** in responses).
- **BLC-COLL-002:** Read paths (metadata, songs list, player) require **read** access to that team’s library; create/update/delete require **library edit** access. Platform **admin** MAY read but MUST NOT mutate collections solely by admin role (see [platform-admin-content.md](./platform-admin-content.md)).
- **BLC-COLL-003:** **`PUT`** replaces **title**, **cover** (blob id), and the ordered **songs** list; **`PUT`** and **`PATCH`** MAY set **`owner`** when the body includes it and the caller may write both the current and target owning teams; omitting **`owner`** leaves it unchanged.
- **BLC-COLL-026:** **`PUT /collections/{id}/cover`** uploads a cover image: **`Content-Type`** MUST be **`image/jpeg`** or **`image/png`**; body size is capped per server configuration (same limit as blob uploads); the server creates a **blob** on the collection’s **owning team**, stores the bytes, sets **`cover`** to the new blob id, and deletes the previous cover blob when present and deletable. Does not require **`If-Match`** (unlike **`PUT`**/**`PATCH`** on the collection JSON body).
- **BLC-COLL-004:** **POST**/**PUT** MAY accept **song** ids the caller cannot read or ids that do not exist; the API MAY still return **201**/**200** and persist those references.

## List pagination and search

- **BLC-COLL-005:** **`GET /collections`** supports **`page`**, **`page_size`**, optional **`q`** (title search), and [list-pagination.md](./list-pagination.md).

## When / then

- **BLC-COLL-006:** WHEN the caller may not read the owning team’s library THEN collection reads respond **404**.
- **BLC-COLL-007:** WHEN the caller is **guest** on the owning team and attempts **POST**/**PUT**/**DELETE** THEN the API responds **404**.
- **BLC-COLL-008:** WHEN the caller is the personal-team **owner**, or **admin** / **content_maintainer** on the owning team, THEN mutations are allowed (subject to validation).
- **BLC-COLL-009:** WHEN **POST** omits **`owner`** THEN the new collection’s **`owner`** IS the caller’s **personal** team. WHEN **POST** includes **`owner`** THEN it MUST name a team id the caller may **edit** (library content); **guest** on that team THEN **404**; unknown team or no edit access THEN **404** (malformed id THEN **400**).
- **BLC-COLL-010:** WHEN **GET /collections** runs THEN only collections whose **`owner`** team the caller may read are returned; optional **`q`** filters by **title** (full-text plus case-insensitive substring).
- **BLC-COLL-011:** WHEN **GET /collections/{id}**, **…/songs**, or **…/player** runs THEN visibility matches **GET /collections/{id}**.
- **BLC-COLL-012:** WHEN **GET …/songs** runs AND a stored song id does not resolve THEN behavior is defined by the implementation (partial list, omission, or error); **500** is reserved for genuine server/infrastructure failures, not as an optional substitute for **200**.
- **BLC-COLL-013:** WHEN **PUT** includes a **song** id that does not exist THEN the API MAY still return **200** and persist the slot; clients SHOULD validate ids.
- **BLC-COLL-014:** WHEN **GET …/songs** includes an entry pointing at a song the caller cannot read THEN the collection **owner** MAY still receive **200** with an entry while per-song detail MAY be incomplete.
- **BLC-COLL-023:** WHEN **PATCH /collections/{id}** runs THEN only fields present in the body are updated; omitted fields are unchanged; unknown fields are rejected (**`deny_unknown_fields`**), matching **BLC-SONG-019**. Optimistic concurrency uses **`If-Match`** with the resource **ETag**.
- **BLC-COLL-015:** WHEN **DELETE** succeeds THEN the collection no longer appears under the same rules as other reads. **DELETE** succeeds only when the collection’s **`songs`** list is empty (**BLC-COLL-025**).
- **BLC-COLL-016:** WHEN a song IS appended to a collection on **POST /songs** (required **`collection`** on create) THEN the caller MUST be allowed to **edit** that collection’s owning team’s library; the append MUST fail with **404** if the collection id is unknown or not writable (so the song is not left orphaned).
- **BLC-COLL-024:** WHEN **PUT** or **PATCH** would drop a **song** id that is currently in the collection’s **`songs`** list (same id regardless of **nr** / **key**) THEN the API responds **409 Conflict**. Callers MAY add songs, reorder entries, or change **nr** / **key** on existing ids. Removing a song from collections MUST be done by **DELETE** `/songs/{id}` (server cascade updates collection **`songs`**).
- **BLC-COLL-025:** WHEN **DELETE** `/collections/{id}` runs AND the collection’s **`songs`** list is non-empty THEN the API responds **409 Conflict**. Callers MUST remove every song from the collection first (**DELETE** `/songs/{id}` cascades and clears slots per **BLC-COLL-019** / **BLC-COLL-024**). Team or user teardown cascades (**BLC-COLL-018**) are out of scope for this rule.

## Cascading deletes

- **BLC-COLL-017:** WHEN the **cover** blob IS **DELETE**d THEN the collection is **not** removed; **`GET /collections/{id}`** still returns **200**, but **`cover`** MAY reference a deleted blob id until updated. Cover image bytes for that id are unavailable until **`cover`** is set to a valid blob.
- **BLC-COLL-018:** WHEN a **user** account IS deleted THEN collections owned by their **personal** team are removed with that team ([user.md](./user.md)).
- **BLC-COLL-019:** WHEN a referenced **song** IS deleted THEN collection endpoints MAY error or show stale slots until **PUT** updates **songs** ([song.md](./song.md)).

## Move (`POST /collections/{id}/move`)

- **BLC-COLL-020:** **`POST /collections/{id}/move`** with body **`{ "owner": "<team id>" }`** requires **library edit** access on **both** the collection’s **current** owning team and the **target** team; if either check fails, or the target team id is unknown or illegal, the API responds **404** (or **400** for malformed **`owner`**), consistent with other ACL hiding. Platform **admin** MUST NOT bypass library write for this operation.
- **BLC-COLL-021:** WHEN the target **`owner`** equals the **current** owning team THEN the handler returns **200** with an **unchanged** representation (idempotent).
- **BLC-COLL-022:** **`POST …/move`** updates **only** the collection’s **`owner`**; it does **not** rewrite **songs** entries or other cross-team references (shallow move).
