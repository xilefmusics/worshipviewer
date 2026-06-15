# Business logic constraints for the song resource

## Static

- **BLC-SONG-001:** Every song belongs to exactly one **owning team** (**`owner`** in responses).
- **BLC-SONG-002:** Listing, single-song **GET**, player, and like endpoints require **read** access to that team’s library; **PUT** and **DELETE** require **library edit** access. Platform **admin** does **not** gain song edit solely by role.
- **BLC-SONG-003:** **`PUT`** and **`PATCH`** MAY change **`owner`** when the body includes **`owner`** (team id) and the caller has **library edit** access to both the song’s current owning team and the target team; omitting **`owner`** leaves it unchanged. Changing the owning team is also available via **`POST /songs/{id}/move`** with **`{ "owner": "<team id>" }`** (see BLC-SONG-020–021).
- **BLC-SONG-004:** **Like** state IS per **current user** and **song**; anyone who may read the song MAY read like status via **GET** `/songs/{id}/like`, set liked via **PUT** `/songs/{id}/like` (204), or remove like via **DELETE** `/songs/{id}/like` (204).

## List pagination and search

- **BLC-SONG-005:** **`GET /songs`** supports **`page`**, **`page_size`**, optional **`q`**, optional **`team`**, and the shared rules in [list-pagination.md](./list-pagination.md) (including whitespace-only **`q`** treated as no filter and **`team`** as a plain owning-team id).

## When / then

- **BLC-SONG-006:** WHEN the caller may not read the owning team’s library THEN song reads respond **404** (not **403**).
- **BLC-SONG-007:** WHEN the caller is **guest** on the owning team and attempts **PUT** or **DELETE** THEN the API responds **404**.
- **BLC-SONG-008:** WHEN the caller is the personal-team **owner**, or **admin** / **content_maintainer** on the owning team, THEN **PUT**/**DELETE** are allowed (subject to validation).
- **BLC-SONG-009:** **POST** MUST include **`collection`** (collection id). The new song’s **`owner`** IS the **owning team of that collection**. The caller MUST have **library edit** access to that team; otherwise **404** (or **400** for malformed id / missing **`collection`**), same visibility pattern as collections.
- **BLC-SONG-010:** WHEN **POST** completes THEN the new song IS appended to the given **`collection`**’s **`songs`** list. Songs are never created without a collection placement (no server-side default collection).
- **BLC-SONG-011:** WHEN **GET /songs** runs THEN only songs whose **`owner`** team the caller may read are returned; optional **`team`** narrows that visible set to one owning team and returns an empty list/count when the caller cannot read that team; optional **`q`** matches **title**, **artists**, and lyric text as defined by the list-search behavior (stemmed where applicable).
- **BLC-SONG-012:** WHEN **GET /songs/{id}** runs THEN visibility matches the list rule AND the response includes **`liked`** for the current user.
- **BLC-SONG-013:** WHEN **GET …/player** runs THEN visibility matches **GET /songs/{id}**.
- **BLC-SONG-014:** WHEN **DELETE /songs/{id}** succeeds THEN the song no longer appears via the API under the same access rules as **PUT**.
- **BLC-SONG-017:** WHEN **PUT /songs/{id}** body fails validation (e.g. empty **`data`**, or wrong types for fields such as **`tempo`** / **`time`**) THEN **400**.
- **BLC-SONG-019:** WHEN **PATCH /songs/{id}** omits **`data`** and other patch fields THEN those properties remain unchanged; the request body lists only fields to update (see OpenAPI **`PatchSong`**).
- **BLC-SONG-018:** WHEN **PUT /songs/{id}** uses an **`{id}`** that does not yet refer to an existing song THEN the API **creates** the song with that **id** and responds **201 Created** with a **`Location`** header naming the new resource, consistent with [create-update-policy.md](./create-update-policy.md) (**Upsert**). **`owner`** in the body selects the owning team when the caller may write that team, otherwise **`owner`** IS the caller’s **personal** team, subject to **BLC-SONG-007** and **BLC-SONG-008** for **guest** vs **edit** rights. WHEN the **`{id}`** already refers to an existing song THEN the API responds **200 OK** with the updated body.

## Move (`POST /songs/{id}/move`)

- **BLC-SONG-020:** **`POST /songs/{id}/move`** requires **library edit** on **both** the song’s current owning team and the target team; otherwise **404** (or **400** for malformed **`owner`**). Platform **admin** MUST NOT bypass library write for move.
- **BLC-SONG-021:** WHEN the target **`owner`** equals the current owning team THEN **200** with an unchanged song (idempotent).
- **BLC-SONG-022:** Move updates **`owner`** only; it does **not** add or remove the song from any **collection** or **setlist** (shallow move).

## Cascading deletes and collection/setlist references

- **BLC-SONG-015:** WHEN a song IS deleted THEN collections and setlists MAY still list its id until updated; **POST**/**PUT** MAY accept unknown ids. Clients SHOULD refresh lists after deletes to avoid stale references.

## Developer notes (non-normative)

- Stale **song** ids inside collection/setlist **songs** arrays after a delete are a client-visible consistency concern; list and detail behavior for unresolved ids is defined by the implementation (see OpenAPI and tests), not by speculative **500** outcomes.
- **BLC-SONG-016:** WHEN a **user** account IS deleted THEN songs owned by their **personal** team are removed with that team ([user.md](./user.md)).
