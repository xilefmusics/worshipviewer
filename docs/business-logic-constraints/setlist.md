# Business logic constraints for the setlist resource

## Static

- **BLC-SETL-001:** Every setlist belongs to exactly one **owning team** (**`owner`** in responses).
- **BLC-SETL-002:** Reads (metadata, songs, player) require **read** access to that team’s library; **PUT** and **DELETE** require **library edit** access. Platform **admin** MAY read but MUST NOT mutate setlists solely by admin role.
- **BLC-SETL-003:** **`PUT`** replaces **title**, ordered **songs**, and related fields; **`PUT`** and **`PATCH`** MAY set **`owner`** when the body includes it and the caller may write both the current and target owning teams (see **BLC-SONG-003** pattern); omitting **`owner`** leaves it unchanged.

## Create payload validation

- **BLC-SETL-004:** **`POST`** MUST include a non-empty **`title`** and a **`songs`** array; missing **`title`**, empty **`title`**, or missing **`songs`** THEN **400**.

## List pagination and search

- **BLC-SETL-005:** **`GET /setlists`** supports **`page`**, **`page_size`**, optional **`q`** (title search), optional **`team`**, and [list-pagination.md](./list-pagination.md) (including whitespace-only **`q`** as no filter).

## When / then

- **BLC-SETL-006:** WHEN the caller may not read the owning team’s library THEN setlist reads respond **404**.
- **BLC-SETL-007:** WHEN the caller is **guest** on the owning team and attempts **PUT** or **DELETE** THEN the API responds **404**.
- **BLC-SETL-008:** WHEN the caller is the personal-team **owner**, or **admin** / **content_maintainer** on the owning team, THEN **PUT**/**DELETE** are allowed (subject to validation).
- **BLC-SETL-009:** WHEN **POST** omits **`owner`** THEN the new setlist’s **`owner`** IS the caller’s **personal** team. WHEN **POST** includes **`owner`**, the same team ACL rules apply as for collections ([collection.md](./collection.md) **BLC-COLL-009**).
- **BLC-SETL-010:** WHEN **GET /setlists** runs THEN only setlists whose **`owner`** team the caller may read are returned; optional **`team`** narrows that visible set to one owning team and returns an empty list/count when the caller cannot read that team; optional **`q`** filters by **title**.
- **BLC-SETL-011:** WHEN **GET /setlists/{id}**, **…/songs**, or **…/player** runs THEN visibility matches **GET /setlists/{id}**.
- **BLC-SETL-012:** WHEN **DELETE** succeeds THEN the setlist no longer appears under the same read rules.
- **BLC-SETL-018:** WHEN **PATCH /setlists/{id}** runs THEN only fields present in the body are updated; omitted fields are unchanged; unknown fields are rejected (**`deny_unknown_fields`**), matching **BLC-SONG-019**. Optimistic concurrency uses **`If-Match`** with the resource **ETag**.
- **BLC-SETL-019:** Each setlist **`songs`** entry MAY include **`language`** as a song language tag and an optional custom **`flow`**. Missing, **`null`**, or stale **`language`** tags inherit the song’s default language for player/export rendering. Missing or **`null`** **`flow`** means default song flow; a non-`null` flow is setlist-only and is threaded into Book rendering.
- **BLC-SETL-020:** Collection song links keep the existing **`SongLink`** contract and do not persist or expose setlist-only **`flow`** data. Collection APIs remain unchanged.

## Cascading deletes

- **BLC-SETL-013:** WHEN a **user** account IS deleted THEN setlists owned by their **personal** team are removed with that team ([user.md](./user.md)).
- **BLC-SETL-014:** WHEN a **song** in **`songs`** IS deleted THEN setlist payloads MAY retain stale ids until **PUT** ([song.md](./song.md)).

## Move (`POST /setlists/{id}/move`)

- **BLC-SETL-015:** **`POST /setlists/{id}/move`** with **`{ "owner": "<team id>" }`** requires **library edit** on **both** the setlist’s current owning team and the target team; otherwise **404** (or **400** for malformed **`owner`**). Platform **admin** MUST NOT bypass library write for move.
- **BLC-SETL-016:** WHEN the target **`owner`** equals the current owning team THEN **200** with unchanged body (idempotent).
- **BLC-SETL-017:** Move is **shallow**: **`songs`** links are not rewritten for cross-team consistency.
