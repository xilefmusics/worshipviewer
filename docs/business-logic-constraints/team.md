# Business logic constraints for the team resource

## Static

- **BLC-TEAM-001:** A **personal** team IS ALWAYS tied 1:1 to one user; that user IS the **`owner`** and MUST NOT appear in **`members`**.
- **BLC-TEAM-002:** A **shared** team HAS NO **`owner`**; the creator IS ALWAYS **admin** in **`members`**.
- **BLC-TEAM-003:** The personal-team **`owner`** IS ALWAYS treated as having at least **admin**-level control over that team and its library.
- **BLC-TEAM-004:** **Team names** NEED NOT be unique.
- **BLC-TEAM-005:** **GET** responses expose **`owner`** and **`members[].user`** as **`{ id, email }`** only.
- **BLC-TEAM-006:** **Personal** teams MUST NOT be deleted via **DELETE /teams/{id}**.

## When / then

- **BLC-TEAM-007:** WHEN listing or reading teams THEN the team IS visible IF the caller is in **`members`**, OR is **`owner`** of that personal team (**except** the reserved catalog team used for public-readable content never appears in **GET /teams** or **GET /teams/{id}**—THEN **404** for everyone). Platform **`admin`** alone does **not** grant access to teams the user does not belong to.
- **BLC-TEAM-008:** WHEN **POST /teams** creates a team THEN it creates a **shared** team; the creator becomes **admin**; optional **`members`** MAY be supplied (creator stays admin if duplicated).
- **BLC-TEAM-009:** WHEN **POST** is used to create a personal team THEN it MUST NOT apply—personal teams come from **user creation** only.
- **BLC-TEAM-010:** WHEN any **guest** or stronger member reads a team THEN read IS allowed.
- **BLC-TEAM-011:** WHEN **PUT** runs on a shared team THEN **`members`** (if present) **replaces** the full list; the shared team MUST keep **≥ one admin**; a personal **`owner`** MUST NOT appear in **`members`**.
- **BLC-TEAM-012:** WHEN **PUT** runs THEN **admin** or personal **owner** MAY change **`name`** and **`members`** within the rules above.
- **BLC-TEAM-013:** WHEN **content_maintainer** or **guest** **PUT**s THEN they MAY only **self-leave**: **`name`** unchanged AND **`members`** equals the current list **minus self**; any other change THEN IS rejected.
- **BLC-TEAM-014:** WHEN someone tries to reassign a personal **`owner`** THEN the operation IS rejected.
- **BLC-TEAM-015:** WHEN removing the last admin on a shared team THEN the API responds **409** until fixed or the team IS deleted.
- **BLC-TEAM-016:** WHEN **DELETE** runs on a **shared** team THEN the actor MUST be **admin** (or equivalent); blobs, songs, collections, and setlists that belonged to that team become owned by the deleting **admin**’s **personal** team (they are not deleted).
- **BLC-TEAM-019:** WHEN **PATCH /teams/{id}** runs THEN only fields present in the body are updated; omitted fields are unchanged; unknown fields are rejected, matching **BLC-SONG-019**. Optimistic concurrency uses **`If-Match`** with the resource **ETag** where applicable.
- **BLC-TEAM-020:** **`PUT /teams/{id}/cover`** uploads a cover image: **`Content-Type`** MUST be **`image/jpeg`** or **`image/png`**; body size is capped per server configuration (same limit as collection cover uploads); the server creates a **blob** owned by the **team**, stores the bytes, sets **`cover`** to the new blob id, and deletes the previous cover blob when present and deletable. Requires team **admin** (or personal-team **owner**). Does not require **`If-Match`**. Clearing **`cover`** via **PATCH** with **`"cover": ""`** deletes the previous cover blob when present.

Platform **admin** read vs write for team-scoped library content: [platform-admin-content.md](./platform-admin-content.md).

## Cascading deletes (user vs team)

- **BLC-TEAM-017:** WHEN a **user** account IS deleted THEN their **personal** team and all library items owned by that team are removed; this IS NOT the same as **DELETE** on a **shared** team, which **reassigns** items to the deleting admin’s personal team.
- **BLC-TEAM-018:** WHEN a **shared** team IS deleted THEN former members lose access to that team id; library items survive on the deleting admin’s personal team as above.
