# API documentation (OpenAPI)

## When / then

- **BLC-DOCS-001:** WHEN **`GET /api/docs/openapi.json`** runs **without** authentication THEN the API responds **200** and returns the OpenAPI schema for the HTTP API (exact wire format MAY follow the generator’s JSON layout).

This route is **outside** the **`/api/v1`** authenticated surface; see [authentication.md](./authentication.md).

- **BLC-DOCS-002:** The published OpenAPI document defines a **`Problem`** schema ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Details) and documents **`application/problem+json`** as the content type for **4xx** and **5xx** response bodies where an error payload is returned.
- **BLC-DOCS-003:** Auth-related routes that use query parameters (for example **`GET /auth/login`**, **`GET /auth/callback`**) declare those parameters as **`in: query`** in OpenAPI.
- **BLC-DOCS-004:** Component schema **property** names in the OpenAPI JSON use **snake_case** (ASCII letters, digits, underscores), consistent with Rust serde defaults.
