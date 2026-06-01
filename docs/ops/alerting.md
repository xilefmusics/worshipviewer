# Log-based alerting

Operator guide for Cloud Logging (or JSON log aggregators) on Worship Viewer backends. Canonical field names: [`../logging-review.md`](../logging-review.md). Deploy and incident outline: [`README.md`](README.md).

## Recommended signals

| Signal | Cloud Logging filter (example) | Severity | First response |
|--------|--------------------------------|----------|----------------|
| **5xx spike** | `jsonPayload.status >= 500` | P2 | Check SurrealDB connectivity, blob disk, recent migrations; use `request_id` triage |
| **API rate limit** | `jsonPayload.event = "audit.api.rate_limit"` | P3 | Review source IP; correlate with `audit.auth.rate_limit` |
| **Auth rate limit** | `jsonPayload.event = "audit.auth.rate_limit"` | P3 | OTP/OIDC abuse; consider WAF |
| **Login failures** | `jsonPayload.event = "audit.auth.login.failure"` | P3 | Credential stuffing watch; volume baseline |
| **Migration failure** | `jsonPayload.migration` exists AND severity ERROR | P1 | Stop traffic; see rollback policy in [`../data-integrity/backup-restore.md`](../data-integrity/backup-restore.md) |
| **Startup config guard** | `jsonPayload.message =~ "COOKIE_SECURE"` OR `"OTP_PEPPER"` | P2 | Fix production env before serving traffic |

Adjust field paths if your sink maps `tracing` JSON differently (e.g. nested under `jsonPayload.fields`).

## Triage workflow

1. Collect **`X-Request-Id`** from client or Problem `instance`.
2. Filter: `jsonPayload.request_id = "<id>"` (see [`README.md`](README.md) § Request ID triage).
3. Follow **`error_source_chain`** and **`target`** to subsystem (`mail.transport_send`, Surreal context, etc.).
4. For P1/P2, preserve logs before rollback.

## Audit vs request logs

- **HTTP audit** (admin): `GET /api/v1/monitoring/http-audit-logs` — paginated request history.
- **Structured audit events:** `jsonPayload.audit = true` with stable **`event`** names — catalog in [`../logging-review.md`](../logging-review.md) §6.

## What is not alert-ready today

- No Prometheus `/metrics` scrape endpoint in production SPA bundle.
- Client-side errors are not ingested server-side yet (action plan **5.4**).
- Content mutation audit events partially tracked (action plan **3.25**).

## Related docs

- [`../logging-review.md`](../logging-review.md) §7 — quick filter bullets
- [`../business-logic-constraints/monitoring.md`](../business-logic-constraints/monitoring.md) — admin monitoring BLCs
