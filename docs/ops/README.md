# Operations runbooks

Abbreviated procedures for deploy verification, rollback, and incident triage. Expand with environment-specific details (Cloud Run, Docker Hub, SurrealDB host).

## Deploy verification

1. Confirm the new revision reports expected metadata:
   ```bash
   curl -sS "$BASE_URL/api/v1/about" | jq .
   ```
   Check `version`, `git_commit`, and `production`.

2. **Readiness** — when health endpoints are exposed, ensure DB and blob directory checks pass before receiving traffic.

3. **Smoke auth** — OTP or OIDC login on staging; `GET /api/v1/users/me` returns 200.

4. **Smoke library** — list songs/collections; open one song; fetch one blob byte range.

5. Review startup logs for migration failures or config guard warnings (`COOKIE_SECURE`, `OTP_PEPPER`).

## Rollback

1. Route traffic to the previous container image tag.
2. Do **not** down-migrate the database. If the new version applied forward migrations incompatible with the old binary, restore from backup instead of rolling back app-only.
3. See [`../data-integrity/backup-restore.md`](../data-integrity/backup-restore.md).

## Request ID triage

1. Collect `X-Request-Id` from the client or Problem `instance`.
2. Search logs: `jsonPayload.request_id = "<id>"` (Cloud Logging) or grep JSON stdout.
3. Follow `error_source_chain` and `target` fields to the failing subsystem (`mail.transport_send`, Surreal context, etc.).

## Audit and HTTP request logs

- Admin **`GET /api/v1/monitoring/http-audit-logs`** — paginated HTTP audit (admin session required).
- Admin **`GET /api/v1/monitoring/metrics`** — aggregated window metrics.
- Constraints: [`../business-logic-constraints/monitoring.md`](../business-logic-constraints/monitoring.md).

## Incident response (outline)

| Severity | Example | First actions |
|----------|---------|---------------|
| P1 | Data loss, auth bypass | Stop deploy; preserve logs; restore from backup if needed |
| P2 | Elevated 5xx | Check DB connectivity, blob disk, recent migrations |
| P3 | 429 spike | Review rate-limit headers; check abuse IP; consider WAF |

## Integration test gate

Production images run Venom tests during `docker build --target tester`. For pre-merge validation of HTTP regressions, build the tester stage locally or rely on `main` Docker CI.

## Log alerting pointers

See **[alerting.md](alerting.md)** for severity, example Cloud Logging filters, and triage workflow. Quick filters:

- 5xx: `jsonPayload.status >= 500`
- Rate limits: `jsonPayload.event = "audit.api.rate_limit"`
- Login failures: `jsonPayload.event = "audit.auth.login.failure"`

See [`../logging-review.md`](../logging-review.md).
