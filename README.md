# Worship Viewer

A tool to help you lead worship — then step aside when the Spirit takes over.  
Its main job is to manage and display digital sheet music; planned work and ideas are tracked in [GitHub issues](https://github.com/xilefmusics/worshipviewer/issues).

## Table of contents

- [Main Principles](#main-principles)
- [Try it out](#try-it-out)
- [Local development](#local-development)
- [Backend configuration](#backend-configuration)
- [Command-line interface (CLI)](#command-line-interface-cli)
- [Contribute](#contribute)
- [License](#license)

## Main Principles

1. **Single source of truth**: You have one source (your song definition) to render sheets, display slides, sample click and cue tracks, and more. Each member of your worship team sees the same song entities; once the song exists, everyone gets the same material in the format they need.
2. **Be prepared but stay flexible**: Plan a set down to the beat, but break out whenever the Holy Spirit leads — or run a fully spontaneous session.
3. **All for His glory**: The app exists to worship and glorify the one true God: the Father, the Son, and the Holy Spirit.

## Try it out

Create your free account at [app.worshipviewer.com](https://app.worshipviewer.com).

Or run the published image locally (see [Local development](#local-development) to build from source):

```bash
docker run --rm -p 8080:8080 xilefmusics/worshipviewer:latest
```

**Platform:** The image on Docker Hub is **linux/amd64**. On Apple Silicon or other **arm64** hosts, Docker may report *no matching manifest*; use emulation when needed:

```bash
docker run --rm -p 8080:8080 --platform linux/amd64 xilefmusics/worshipviewer:latest
```

## Local development

The React frontend lives in [`frontend/`](frontend/) (pnpm monorepo with a Vite SPA in `frontend/app/`). In production and in the Docker image, the backend serves the built SPA from the same origin as `/api` and `/auth`.

For local dev, run the **Vite dev server** and let it **proxy** API traffic to your chosen backend. Leave **`VITE_API_BASE_URL` unset** (empty) so the browser stays same-origin with the dev server.

### Install prerequisites

**Frontend** (Node.js 20 + pnpm 10):

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
```

**Chordlib WASM** (built automatically by `pnpm build`; required for song editor and player preview):

```bash
rustup target add wasm32-unknown-unknown
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

**Backend** (optional for frontend-only UI work against production):

```bash
# macOS
brew install rustup
rustup update stable

# Linux / Windows: https://rustup.rs/
```

The Docker image is built with **Rust 1.94.1**, **Node.js 20**, **pnpm 10.33.0**, and **wasm-pack** (see the root [`Dockerfile`](Dockerfile)).

### Start the frontend against the local dev backend (recommended)

**Terminal 1 — backend:**

```bash
cd backend && \
  INITIAL_ADMIN_USER_EMAIL="admin@example.com" \
  INITIAL_ADMIN_USER_TEST_SESSION=true \
  cargo run
```

Default listen address is `127.0.0.1:8080`. The initial admin session id is `admin`.

**Terminal 2 — frontend:**

```bash
pnpm -C frontend dev
```

Open the URL Vite prints (default `http://127.0.0.1:5173`). The dev server proxies `/api` and `/auth` to `http://127.0.0.1:8080` by default, so session cookies behave like production.

To override the proxy target, create `frontend/app/.env.development.local`:

```bash
VITE_DEV_PROXY_TARGET=http://127.0.0.1:8080
```

### Start the frontend against the production backend

Useful for UI work against live data:

```bash
VITE_DEV_PROXY_TARGET=https://app.worshipviewer.com pnpm -C frontend dev
```

**Caveats:**

- The Vite proxy avoids browser CORS issues (the backend does not emit CORS headers).
- **Session cookies from production will not authenticate localhost** (they are domain-bound). Use this for read-only UI checks or public endpoints; for full auth flows, use the [local backend](#start-the-frontend-against-the-local-dev-backend-recommended) or log in on [app.worshipviewer.com](https://app.worshipviewer.com) directly.
- Do **not** set `VITE_API_BASE_URL` for normal dev — reserve it for exceptional cross-origin setups that require explicit backend alignment (CORS, cookies, HTTPS).

### Single-process / production-like local run

Mirrors the Docker deployment model (backend serves the built SPA):

```bash
pnpm -C frontend build
cd backend && \
  INITIAL_ADMIN_USER_EMAIL="admin@example.com" \
  INITIAL_ADMIN_USER_TEST_SESSION=true \
  STATIC_DIR=../frontend/app/dist \
  cargo run
```

Open `http://127.0.0.1:8080` — one process serves both API and SPA.

The in-app song editor expects **ChordPro** text (via **chordlib**). To import from **Ultimate Guitar**, save the tab page in your browser and paste the HTML into the song editor source — it converts to Worship Pro automatically. **Ultimate Guitar is not fetched over HTTP** by the app.

**Production safety:** The backend **refuses to start** if `INITIAL_ADMIN_USER_TEST_SESSION` is set while `WORSHIP_PRODUCTION` is true or `RUST_ENV=production`. Do not enable the test session in production.

**Logs:** The backend uses [`tracing`](https://docs.rs/tracing). Set [`RUST_LOG`](https://docs.rs/tracing-subscriber/latest/tracing_subscriber/filter/struct.EnvFilter.html) for verbosity (for example `RUST_LOG=backend=debug,surrealdb=info`). Use `LOG_FORMAT=json` for newline-delimited JSON on stdout (also the default when `WORSHIP_PRODUCTION=true` or `RUST_ENV=production`). Incoming `traceparent` may supply the span id used as `X-Request-Id` and the `request_id` field on the per-request span. See [`docs/architecture/backend-request-flow.md`](docs/architecture/backend-request-flow.md) for full logging and audit-event notes.

### Persist data across backend restarts

```bash
# Start the database as a separate process
docker run --rm -p 8000:8000 surrealdb/surrealdb:v3.0.5 start --log debug --user root --pass root memory

# Start the backend connected to that database
cd backend && \
  INITIAL_ADMIN_USER_EMAIL="admin@example.com" \
  INITIAL_ADMIN_USER_TEST_SESSION=true \
  DB_ADDRESS="ws://localhost:8000" \
  DB_USERNAME="app" \
  DB_PASSWORD="app" \
  cargo run
```

## Backend configuration

Configuration is driven by environment variables (uppercase names matching the `Settings` struct in [`backend/src/settings.rs`](backend/src/settings.rs), loaded with [`envy`](https://crates.io/crates/envy)). Highlights:

- **HTTP:** `HOST`, `PORT` (defaults: `127.0.0.1`, `8080`).
- **Cookies / session:** `POST_LOGIN_PATH`, `COOKIE_NAME`, `COOKIE_SECURE`, `SESSION_TTL_SECONDS`.
- **OTP email:** `OTP_TTL_SECONDS`, `OTP_PEPPER`, `OTP_MAX_ATTEMPTS`, `OTP_ALLOW_SELF_SIGNUP` (optional override: `WORSHIP_OTP_ALLOW_SELF_SIGNUP`). Outbound mail uses **Gmail SMTP** via `GMAIL_APP_PASSWORD` and `GMAIL_FROM` (see [`backend/src/mail.rs`](backend/src/mail.rs)); empty values are only workable if you never send mail.
- **OIDC (e.g. Google):** `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URL`, `OIDC_SCOPES`.
- **Database:** `DB_ADDRESS`, `DB_USERNAME`, `DB_PASSWORD`, `DB_MIGRATION_PATH`.
- **Static assets and uploads:** `STATIC_DIR`, `BLOB_DIR`, `BLOB_UPLOAD_MAX_BYTES`.
- **Rate limits:** `AUTH_RATE_LIMIT_RPS`, `AUTH_RATE_LIMIT_BURST`, `API_RATE_LIMIT_RPS`, `API_RATE_LIMIT_BURST`.
- **OpenAPI metadata:** `OPENAPI_CONTACT_EMAIL`, `OPENAPI_IMPRINT_URL`.

For authentication behavior (OTP, sessions, and constraints), see [`docs/business-logic-constraints/authentication.md`](docs/business-logic-constraints/authentication.md).

## Command-line interface (CLI)

You can talk to the Worship Viewer REST API from the terminal with the AI-oriented CLI `worshipviewer`. It uses the same API as the frontend and is easy to script.

### Installation

- **Prerequisite:** a recent Rust toolchain (see [Install prerequisites](#install-prerequisites)).
- From the repository root:

```bash
cargo install --path cli
```

This installs a `worshipviewer` binary on your `$PATH`.

### Configuration

The CLI can use flags, environment variables, or a config file. Precedence:

1. CLI flags  
2. Environment variables  
3. Config file  
4. Built-in defaults  

- **Config file (optional)** — `~/.worshipviewer/config.toml`. On first use the CLI may **create** this file with defaults.
  ```toml
  base_url = "http://127.0.0.1:8080"
  sso_session = "admin"
  ```
- **Base URL** (backend address)
  - Flag: `--base-url`
  - Env: `WORSHIPVIEWER_BASE_URL`
  - Config: `base_url`
  - Default: `http://127.0.0.1:8080`
- **Authentication**
  - Cookie (typical for local dev): `--sso-session`, env `WORSHIPVIEWER_SSO_SESSION`, config `sso_session`. Sends `Cookie: sso_session=<value>` (backend cookie name is configurable; default matches).
  - Bearer: `--bearer-token`, env `WORSHIPVIEWER_BEARER_TOKEN` → `Authorization: Bearer …`.
- **Timeout:** env `WORSHIPVIEWER_TIMEOUT_SECS`, flag `--timeout-secs`.
- **Output format:** global `--output auto|json|pretty|ndjson` or env **`WORSHIPVIEWER_OUTPUT`** (same values).

### Output and AI-friendly behavior

The CLI emits machine-readable JSON:

- Global flag: `--output auto|json|pretty|ndjson`
  - `auto` (default): pretty JSON in a TTY, compact when piped.
  - `json`: compact JSON.
  - `pretty`: human-readable.
  - `ndjson`: one JSON object per line (good for large lists).

For scripts and agents, prefer `--output json` or `--output ndjson`.

### Common commands

Inspect the API schema:

```bash
worshipviewer schema --output json
worshipviewer schema --path-prefix /api/v1/songs --output json
```

List and get songs:

```bash
worshipviewer songs list --output ndjson
worshipviewer songs get --id <song_id> --output json
```

Create or update with raw JSON:

```bash
worshipviewer songs create \
  --json '{"not_a_song":false,"blobs":[],"data":{...}}' \
  --output json
```

Dry-run a mutating request:

```bash
worshipviewer songs update \
  --id <song_id> \
  --json '{...}' \
  --dry-run \
  --output json
```

### Auth quickstart for local development

When you start the backend [as shown above](#start-the-frontend-against-the-local-dev-backend-recommended), you get an initial admin session with id `admin` and the `sso_session` cookie.

Example `~/.worshipviewer/config.toml`:

```toml
base_url = "http://127.0.0.1:8080"
sso_session = "admin"
```

Then:

```bash
worshipviewer songs list --output json
```

## Contribute

This app is from worshippers for worshippers. Contributions are welcome — coding can be worship too.

Use `cargo fmt` and `cargo clippy` on the crates you touch; open issues and pull requests on [GitHub](https://github.com/xilefmusics/worshipviewer).

## License

[AGPL-3.0](LICENSE)
