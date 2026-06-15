# Business logic constraints for monitoring (admin metrics)

## Static

- **BLC-MON-001:** Every HTTP request handled by the backend results in **one** `http_request_audit` row (including `/auth/*`, `/api/docs/*`, and static asset routes), written **asynchronously** with best-effort persistence (logging failures MUST NOT change the HTTP response).
- **BLC-MON-005:** **`GET /api/v1/monitoring/metrics`** exposes one daily metrics entry per inclusive UTC calendar date (`start=YYYY-MM-DD&end=YYYY-MM-DD`); access is **admin-only** (same pattern as **BLC-MON-004** for audit logs). Query parameters and response shape are defined in OpenAPI.
- **BLC-MON-007:** Monitoring metrics are cached in the `metrics` table per completed UTC calendar day. Requests calculate and upsert missing completed days through yesterday; today is calculated dynamically when included and MUST NOT be persisted in `metrics`.
- **BLC-MON-008:** Each daily metrics entry contains `daily`, `weekly`, and `monthly` rolling windows. User aggregates MUST NOT expose user or session identities; request distribution metrics store only aggregate request counts.
- **BLC-MON-006:** Successful **OTP** and **OIDC** logins produce monitoring/audit records suitable for security review (see `audit_events` tests); failed login attempts SHOULD be auditable where the implementation records them.
- **BLC-MON-002:** Authenticated `/api/v1/*` requests that pass session validation populate `user` and `session` record links on the audit row; requests without a validated session (or outside `/api/v1`) store **no** user/session links (`NONE`).
- **BLC-MON-003:** When a **user** or **session** row is **deleted**, existing `http_request_audit` rows remain; the corresponding `user` and/or `session` link fields are cleared so no dangling record references remain.
- **BLC-MON-004:** `GET /api/v1/monitoring/http-audit-logs` is **admin-only**: an authenticated non-admin receives **403**; no session receives **401**.

## Notes

- Additional monitoring endpoints (for example monthly active users) SHOULD live under the **`/api/v1/monitoring/`** prefix and follow the same admin-only pattern unless explicitly documented otherwise.
- Public deployment metadata (version, git commit, production flag) is available unauthenticated at **`GET /api/v1/about`** — see [`backend-resource.md`](../architecture/backend-resource.md).
