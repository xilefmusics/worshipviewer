# Cross-resource HTTP contract

Rules that apply across several **`/api/v1`** resources (path validation, idempotent deletes). Resource-specific visibility (**404** vs **403**) stays in each resource’s doc.

## Path parameters

- **BLC-HTTP-001:** WHEN a path segment that MUST match the API’s resource **id** format IS syntactically invalid THEN the API responds **400** (same class of validation as list query integers in **BLC-LP-004**; see [list-pagination.md](./list-pagination.md)).

## Validation status codes

- **BLC-HTTP-003:** The API does **not** use **422 Unprocessable Entity**. Invalid JSON, unknown fields (`deny_unknown_fields`), and other request validation failures are **400 Bad Request** with `application/problem+json`.

## Idempotent DELETE

- **BLC-HTTP-002:** WHEN **DELETE** on a resource succeeds and the client issues the same **DELETE** again for that **id** THEN the API responds **404** (same pattern as **BLC-USER-014** for users).

## API rate limiting (`/api/v1/*`)

- **BLC-HTTP-004:** Versioned **`/api/v1/*`** routes are rate-limited **per client IP** (see `backend` settings **`API_RATE_LIMIT_RPS`** and **`API_RATE_LIMIT_BURST`**, defaults **50** RPS and burst **200**). The governor uses the client address from the connection, with a fallback when the peer address is unavailable (see implementation). **`/auth/*`** routes use separate **`auth_rate_limit_*`** settings. WHEN the limit IS exceeded THEN the API responds **429 Too Many Requests** with **`Retry-After`** and **`X-RateLimit-*`** headers ([`actix-governor`](https://docs.rs/actix-governor/latest/actix_governor/)).

## Conditional requests (ETag)

- **BLC-HTTP-005:** Single-resource **GET**, **PATCH**, **PUT**, and **DELETE** on **songs**, **collections**, and **setlists** (JSON bodies) use a weak **`ETag`** over the canonical JSON representation. **`If-None-Match`** matching the current **`ETag`** on **GET** yields **304 Not Modified**. **`If-Match`** on mutating requests MUST match the current **`ETag`** or the API responds **412 Precondition Failed** (see **`http_cache`** in the backend). **Blob** byte responses follow **BLC-BLOB-016**.

## Unknown routes under `/api` and `/auth`

- **BLC-HTTP-006:** Requests to unrecognized paths under **`/api/**`** or **`/auth/**`** that are handled by the API return **`application/problem+json`** (not an HTML SPA fallback).

## Platform admin and team library ACL

- See [platform-admin-content.md](./platform-admin-content.md) (**BLC-ADMIN-001**, **BLC-ADMIN-002**).
