# Business logic constraints for the session resource

## Static

- **BLC-SESS-001:** A **session** IS ALWAYS bound to exactly one **user**.
- **BLC-SESS-002:** Session identifiers ARE opaque; a valid session token (or session cookie) lets the client act as that user on **`/api/v1`** within that user’s normal permissions.

## When / then

- **BLC-SESS-003:** WHEN any authenticated caller uses **`GET /users/me/sessions`** THEN only **their** sessions are listed.
- **BLC-SESS-004:** WHEN any authenticated caller uses **`GET /users/me/sessions/{id}`** or **`DELETE /users/me/sessions/{id}`** THEN **`{id}`** MUST be one of **their** sessions; otherwise THEN **404**.
- **BLC-SESS-005:** WHEN a non-admin uses **`POST`**, **`GET`**, or **`DELETE`** under **`/users/{user_id}/sessions`** (including **`…/sessions/{id}`**) THEN the API responds **403** (admin-only).
- **BLC-SESS-006:** WHEN platform **admin** uses **`/users/{user_id}/sessions`** THEN they MAY list, **POST** (create), **GET** one, and **DELETE** sessions for that user; invalid **`user_id`** THEN **404**; already-deleted **`{id}`** THEN **404**.
- **BLC-SESS-007:** WHEN a non-admin calls **`POST /users/{user_id}/sessions`** for another user’s id THEN the API responds **403**.

## Invalidation

- **BLC-SESS-008:** WHEN a **user** account IS removed (**`DELETE /users/{id}`**) THEN **all** sessions for that user stop working immediately: **`GET /users/me`** (and other authenticated calls with only that session) THEN **401**.
- **BLC-SESS-009:** WHEN a session IS **DELETE**d (by its user via **`/users/me/sessions/{id}`** or by admin) THEN that session id MUST NOT authenticate again.
- **BLC-SESS-010:** WHEN a session row exists but **`expires_at`** IS in the past THEN **`RequireUser`** responds **401**; the row remains in the database until explicitly removed (**`/auth/logout`**, **`DELETE …/sessions/{id}`**, or related flows). Expired sessions MAY still appear in session listing endpoints until deleted.
