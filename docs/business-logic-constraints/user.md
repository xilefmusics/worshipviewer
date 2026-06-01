# Business logic constraints for the user resource

## Static

- **BLC-USER-001:** **`email`** IS ALWAYS unique after normalization (trim, lowercase). The database schema also enforces normalization and email shape as defense-in-depth; callers SHOULD send normalized email, and the API validates at the boundary (see implementation).
- **BLC-USER-002:** **`role`** IS ALWAYS platform **`default`** or **`admin`** (separate from team **guest** / **content_maintainer** / **admin** on teams).
- **BLC-USER-003:** Creating a user IS ALWAYS paired with creating that user’s **personal** team (**owner** 1:1).
## List pagination

- **`GET /users`** (platform admin only) supports **`page`**, **`page_size`**, and the shared rules in [list-pagination.md](./list-pagination.md).

## When / then

- **BLC-USER-005:** WHEN any authenticated user calls **GET /users/me** THEN they receive their own **User** record for the current session.
- **BLC-USER-006:** **`Authorization`** MUST use the **`Bearer `** scheme: the value MUST be **`Bearer <session token>`**. A raw token without the **`Bearer `** prefix is **not** accepted; the API responds **401** (same as missing auth).
- **BLC-USER-007:** WHEN a non-admin calls **GET /users**, **GET /users/{id}**, **POST /users**, or **DELETE /users/{id}** THEN the API responds **403**.
- **BLC-USER-008:** WHEN **POST /users** uses an email that already exists THEN the API responds **409**; invalid or missing email THEN **400**.
- **BLC-USER-009:** WHEN **GET /users/{id}** runs THEN the caller MUST be platform **admin** OR otherwise be allowed by the API to read that profile; **guest** membership on someone’s **personal** team does **not** imply permission to read the **owner**’s user record (**403**).
- **BLC-USER-010:** WHEN the current user calls **GET** or **DELETE** on **`/users/me/sessions`** or **`/users/me/sessions/{id}`** THEN only sessions belonging to **me** are visible or deletable; another user’s session id THEN **404**. See [session.md](./session.md).
- **BLC-USER-011:** WHEN platform admin uses **`/users/{user_id}/sessions`** (and `{id}`) THEN they MAY list, **POST** (create), fetch, or delete that user’s sessions (session lifetime per server configuration).
- **BLC-USER-015:** **`PUT /users/me/profile-picture`** uploads a profile image: **`Content-Type`** MUST be an allowed image type; body size and dimensions are capped per server configuration; the server stores bytes as a **blob** on the user’s **personal** team and sets **`avatar_blob_id`**.
- **BLC-USER-016:** **`DELETE /users/me/profile-picture`** removes the uploaded avatar blob reference (**`avatar_blob_id`**) when present; OAuth-cached avatars (**`oauth_avatar_blob_id`**) are unchanged.

## Cascading deletes

- **BLC-USER-012:** WHEN **`DELETE /users/{id}`** succeeds THEN that user’s sessions stop working; clients using only those sessions THEN get **401** on authenticated routes.
- **BLC-USER-013:** WHEN the user account IS deleted THEN their **personal** team and all blobs, songs, collections, and setlists owned by that team are removed; former **guests** or **content_maintainer** members of that personal team THEN see **404** on those resources (no reassignment—contrast **shared** team **DELETE** in [team.md](./team.md)).
- **BLC-USER-014:** WHEN **`DELETE /users/{id}`** IS repeated for the same id THEN **404**.
