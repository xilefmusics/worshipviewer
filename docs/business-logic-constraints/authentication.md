# Authentication for `/api/v1`

Applies to routes under **`/api/v1`** that require an authenticated user session (most mutating and private reads). The unauthenticated OpenAPI document is specified in [api-documentation.md](./api-documentation.md) (**BLC-DOCS-001**). Other public routes (e.g. health checks) are deployment-specific and are **not** covered here.

## When / then

- **BLC-AUTH-001:** WHEN a caller uses a route that **requires authentication** without an **`Authorization`** header whose value is interpreted as a **Bearer** session token (**BLC-USER-006**) THEN the API responds **401**.
- **BLC-AUTH-002:** WHEN **`Authorization: Bearer <token>`** is present but **`<token>`** IS NOT a valid, active session (**missing row**, **expired `expires_at`**, or **revoked**) THEN the API responds **401** before evaluating resource rules that would yield **403** or **404**.

## Relation to sessions

Session lifecycle (including **BLC-SESS-010** expired rows that stay in the DB until deleted), **404**/**403** on **`/users/.../sessions`**, and **BLC-SESS-008**/**BLC-SESS-009** are in [session.md](./session.md). **BLC-AUTH-002** applies when the token never identifies a usable session; after **BLC-SESS-008**/**BLC-SESS-009**, a once-valid token MAY also yield **401** on subsequent calls.

## OIDC (browser login)

- **BLC-AUTH-OIDC-001:** **`GET /auth/login`** starts the OIDC **authorization code** flow: the server responds with **302** to the configured identity provider (**`authorization_endpoint`**), passing **`state`** and **`nonce`** query parameters.
- **BLC-AUTH-OIDC-002:** **`state`** is single-use and bound to the browser session; **`GET /auth/callback`** MUST receive a **`state`** that matches the pending login; mismatch or reuse yields **401** / error response per implementation.
- **BLC-AUTH-OIDC-003:** Redirect URI used in the authorize request MUST be on the server allowlist; **`nonce`** is validated against the ID token where applicable.
- **BLC-AUTH-OIDC-004:** Successful OIDC login issues the same session cookie semantics as OTP login (**`Set-Cookie`**, flags, path) unless deployment configuration differs.

## Email OTP

- **BLC-AUTH-OTP-001:** **`POST /auth/otp/request`** stores a short-lived hashed code and sends it out-of-band. Per-IP rate limits apply (see server **`auth_rate_limit_*`** settings).
- **BLC-AUTH-OTP-002:** **`POST /auth/otp/verify`** validates the code; after too many failures the code is invalidated (**429** / request a new code — see server **`otp_max_attempts`**).
- **BLC-AUTH-OTP-003:** When **`WORSHIP_OTP_ALLOW_SELF_SIGNUP`** is unset or true, a successful verify MAY create a user for a previously unknown email (same as historical behavior). When **`WORSHIP_OTP_ALLOW_SELF_SIGNUP`** is **`false`**/**`0`**, verify succeeds only if the user already exists; otherwise **400** with a stable message (`invalid_request` / no self-signup).
