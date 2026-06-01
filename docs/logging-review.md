# Logging review — canonical fields and audit catalog

This document replaces the former standalone `logging-review.md` referenced from architecture docs. It defines stable field names for structured logs and lists audit events the backend emits.

## 1. Subscriber setup

See [`backend/src/observability.rs`](../backend/src/observability.rs):

- **`RUST_LOG`** — `tracing` filter (default `info`).
- **`LOG_FORMAT`** — `json`, `compact`, or `pretty`. Unrecognized values log a warning and fall back to environment defaults.
- Production defaults to JSON when `WORSHIP_PRODUCTION=true` or `RUST_ENV=production`.

## 2. Request correlation

[`tracing-actix-web`](https://docs.rs/tracing-actix-web) creates a root span per HTTP request. The request-id middleware stores the same id for Problem `instance` and echoes **`X-Request-Id`**. W3C **`traceparent`** span ids are preferred when present.

## 3. PII hygiene

- Do **not** log raw session bearer tokens or OTP codes. Use hashed or truncated identifiers in audit spans.
- Hash or omit raw email addresses in debug spans (see `MailService` and startup banner).
- HTTP audit rows link to user/session records; deleting users clears dangling links (**BLC-MON-003**).

## 4. Startup line

Startup logs include service name, version, optional **`git_commit`** (`GIT_COMMIT_SHA` build arg), and production flag. See `GET /api/v1/about` for the public subset.

## 5. Canonical log fields

| Field | Type | Meaning |
|-------|------|---------|
| `request_id` | string | UUID or W3C `traceparent` span id |
| `user_id` | string | Authenticated user id |
| `session_id` | string | Session being created, validated, or revoked |
| `team_id` | string | Resolved team context |
| `route` | string | Matched Actix route pattern |
| `method` | string | HTTP method |
| `status` | u16 | HTTP response status |
| `latency_ms` | u64 | Request latency in milliseconds |
| `event` | string | Stable event name (`startup`, `audit.*`, …) |
| `audit` | bool | `true` on lines emitted via `audit!` |
| `error` | Display | Primary error message |
| `error_debug` | Debug | Developer-oriented detail |
| `error_source_chain` | string | `Error::source` chain |
| `target` | string | I/O boundary tag for `log_error_chain` |
| `context` / `migration` | string | Surreal failures: app context vs migration script |

## 6. Audit event catalog

Structured audit lines use **`audit = true`** and a stable **`event`** name (`audit!` macro). Regression tests in [`backend/src/audit_events_tests.rs`](../backend/src/audit_events_tests.rs) guard the catalog.

| `event` | Typical trigger |
|---------|-----------------|
| `audit.auth.login.success` | OIDC or OTP login success |
| `audit.auth.login.failure` | Failed OTP / OIDC |
| `audit.auth.logout` | Session revoked |
| `audit.auth.rate_limit` | Auth endpoint 429 |
| `audit.api.rate_limit` | `/api/v1` 429 |

Content mutation audit coverage is tracked separately (see action plan item 3.25).

## 7. Log-based alerting

For Cloud Logging / similar, filter on:

- `jsonPayload.status >= 500` — server errors
- `jsonPayload.event = "audit.api.rate_limit"` — abuse signals
- `jsonPayload.event = "audit.auth.login.failure"` — credential stuffing

Full operator guide (severity, migration failures, triage): [`docs/ops/alerting.md`](ops/alerting.md).

See [`docs/ops/README.md`](ops/README.md) for deploy verification and incident triage using `request_id`.
