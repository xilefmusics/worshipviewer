# Remote MCP integration

Worship Viewer exposes a read-only remote MCP server at `POST /mcp`. It uses the Rust MCP SDK's stateless Streamable HTTP transport and supports protocol revisions `2025-03-26`, `2025-06-18`, `2025-11-25`, and `2026-07-28`.

## OAuth setup

Set `PUBLIC_BASE_URL` to the public app origin. In production MCP is disabled when the default local origin is left unchanged; setting an HTTPS app origin enables it. For the local Vite setup, use `http://127.0.0.1:5173`; Vite proxies OAuth discovery, token, revocation, and MCP requests to the backend while serving the consent screen itself. The resource identifier is exactly `{PUBLIC_BASE_URL}/mcp`.

The server publishes:

- Authorization server metadata at `/.well-known/oauth-authorization-server`.
- Protected resource metadata at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`.
- Authorization code, token, and revocation endpoints under `/oauth`.
- Consent and connected-grant endpoints under `/api/v1/mcp/oauth`.

The OAuth server supports ChatGPT's stable CIMD client ID (`https://chatgpt.com/oauth/client.json`), the authorization-code grant, PKCE with `S256`, resource indicators, the `music:read` scope, and refresh-token rotation. Reuse of a rotated refresh token revokes its grant family. The redirect URI must exactly match the metadata document and use HTTPS. Other CIMD clients are not supported. No OpenID Connect identity claims are issued.

Users sign in through Worship Viewer's existing Google OIDC or email OTP login and approve the requested read access on the consent screen. Access tokens last 15 minutes. Rotating refresh tokens have a 30-day absolute lifetime. Connected apps can be disconnected from **Settings → Connections**.

## Available tools

| Tool | Input | Result |
| --- | --- | --- |
| `search_songs` | Optional `q`, `team`, `page`, `page_size` | Matching songs and total count |
| `get_song` | `id` | One song |
| `search_setlists` | Optional `q`, `team`, `page`, `page_size` | Matching setlists and total count |
| `get_setlist` | `id` | One setlist |
| `search_collections` | Optional `q`, `team`, `page`, `page_size` | Matching collections and total count |
| `get_collection` | `id` | One collection |

Search page size defaults to 20 and is capped at 100. The tools call the same per-user service methods as the REST API. Team filters do not grant additional visibility. The endpoint does not expose write, delete, media, session, or administrative tools.

## Protocol and security notes

- Bearer tokens are opaque. The database stores hashes rather than token values.
- A tool call reloads the user's current authorization context, so team membership changes apply without waiting for the access token to expire.
- OAuth consent actions require the browser `Origin` to match the configured app origin or the request origin used by the same-origin frontend.
- OAuth and MCP routes use the configured auth/API IP rate limits.
- MCP OAuth state and grants are stored in the application's SurrealDB database. Apply the standard backend database backup and retention policies.

See [authentication BLCs](business-logic-constraints/authentication.md#mcp-oauth) for the machine-checkable behavior contract.
