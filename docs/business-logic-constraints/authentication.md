# Authentication for `/api/v1`

Applies to routes under **`/api/v1`** that require an authenticated user session (most mutating and private reads). The unauthenticated OpenAPI document is specified in [api-documentation.md](./api-documentation.md) (**BLC-DOCS-001**). Other public routes (e.g. health checks) are deployment-specific and are **not** covered here.

## When / then

- **BLC-AUTH-001:** WHEN a caller uses a route that **requires authentication** without an **`Authorization`** header whose value is interpreted as a **Bearer** session token (**BLC-USER-006**) THEN the API responds **401**.
- **BLC-AUTH-002:** WHEN **`Authorization: Bearer <token>`** is present but **`<token>`** IS NOT a valid, active session (**missing row**, **expired `expires_at`**, or **revoked**) THEN the API responds **401** before evaluating resource rules that would yield **403** or **404**.
- **BLC-AUTH-003:** A valid browser `wv_impersonation` cookie is considered only after the primary `sso_session` is authenticated and only when `IMPERSONATION_ENABLED=true`; bearer-token requests ignore it. The resulting subject context follows [impersonation.md](impersonation.md).

## Relation to sessions

Session lifecycle (including **BLC-SESS-010** expired rows that stay in the DB until deleted), **404**/**403** on **`/users/.../sessions`**, and **BLC-SESS-008**/**BLC-SESS-009** are in [session.md](./session.md). **BLC-AUTH-002** applies when the token never identifies a usable session; after **BLC-SESS-008**/**BLC-SESS-009**, a once-valid token MAY also yield **401** on subsequent calls.

## OIDC (browser login)

- **BLC-AUTH-OIDC-001:** **`GET /auth/login`** starts the OIDC **authorization code** flow: the server responds with **302** to the configured identity provider (**`authorization_endpoint`**), passing **`state`** and **`nonce`** query parameters.
- **BLC-AUTH-OIDC-002:** **`state`** is single-use and bound to the browser session; **`GET /auth/callback`** MUST receive a **`state`** that matches the pending login; mismatch or reuse yields **401** / error response per implementation.
- **BLC-AUTH-OIDC-003:** Redirect URI used in the authorize request MUST be on the server allowlist; **`nonce`** is validated against the ID token where applicable.
- **BLC-AUTH-OIDC-004:** Successful OIDC login issues the same session cookie semantics as OTP login (**`Set-Cookie`**, flags, path) unless deployment configuration differs.
- **BLC-AUTH-OIDC-005:** **`GET /auth/native/login`** accepts an app-generated state and S256 PKCE challenge, then starts the existing OIDC flow for the system browser. It MUST NOT accept a caller-controlled redirect URI.
- **BLC-AUTH-OIDC-006:** A successful native OIDC callback returns a random, short-lived, single-use handoff code to the fixed **`worshipviewer://auth/callback`** URI. The server stores only a hash of the code, bound to the app state and PKCE challenge; code values MUST NOT be logged or returned in a response body.
- **BLC-AUTH-OIDC-007:** **`POST /auth/native/exchange`** requires the handoff code, original state, and PKCE verifier. It MUST atomically consume the code only when state, challenge, and expiry match, then set the normal `HttpOnly` session cookie without returning a session token in JSON. Invalid, expired, replayed, or mismatched codes yield **401**.
- **BLC-AUTH-OIDC-008:** When the identity provider returns an authorization error for a native login, **`GET /auth/callback`** redirects to the fixed desktop callback with a generic failure marker and the app state. It MUST NOT create a session or include provider error details in the deep link.

## Email OTP

- **BLC-AUTH-OTP-001:** **`POST /auth/otp/request`** stores a short-lived hashed code and sends it out-of-band. Per-IP rate limits apply (see server **`auth_rate_limit_*`** settings).
- **BLC-AUTH-OTP-002:** **`POST /auth/otp/verify`** validates the code; after too many failures the code is invalidated (**429** / request a new code — see server **`otp_max_attempts`**).
- **BLC-AUTH-OTP-003:** When **`WORSHIP_OTP_ALLOW_SELF_SIGNUP`** is unset or true, a successful verify MAY create a user for a previously unknown email (same as historical behavior). When **`WORSHIP_OTP_ALLOW_SELF_SIGNUP`** is **`false`**/**`0`**, verify succeeds only if the user already exists; otherwise **400** with a stable message (`invalid_request` / no self-signup).

## MCP OAuth

- **BLC-MCP-AUTH-001:** The remote MCP resource is **`{PUBLIC_BASE_URL}/mcp`**. OAuth authorization-server and protected-resource metadata MUST publish that same issuer/resource binding.
- **BLC-MCP-AUTH-002:** The authorization server accepts OAuth 2.1 authorization-code requests only with PKCE **S256**, an exact resource match, and the single supported scope **`music:read`**. It accepts CIMD client IDs only from HTTPS metadata documents hosted under `chatgpt.com` or `openai.com`; the requested redirect URI must exactly match the document and use HTTPS.
- **BLC-MCP-AUTH-003:** Every authorization requires an authenticated Worship Viewer session and an explicit consent decision. Consent mutations require a same-origin browser `Origin`; only the app's own login session may approve or revoke its grants.
- **BLC-MCP-AUTH-004:** Authorization codes, access tokens, and refresh tokens are 256-bit random values. The database stores only their SHA-256 hashes. Authorization codes expire after 10 minutes and are deleted atomically when exchanged. Access tokens expire after 15 minutes. Refresh tokens are single-use, rotate on refresh, and expire 30 days after exchange. Reuse of a rotated refresh token revokes its grant family.
- **BLC-MCP-AUTH-005:** Every MCP request must present a valid bearer access token for the exact `/mcp` resource and `music:read` scope. The server rebuilds the current user/team authorization context before each call; revoked grants and current Worship Viewer ACLs take effect on the next request.
- **BLC-MCP-AUTH-006:** The MCP server exposes only read tools for searching and getting songs, setlists, and collections. Resource reads MUST go through the existing per-user resource services so public/team visibility rules remain the same as the REST API.
- **BLC-MCP-AUTH-007:** The connected-app settings API lists a user's active MCP grants. Revoking a grant deletes its access and refresh tokens so every token in that grant family stops working immediately.
