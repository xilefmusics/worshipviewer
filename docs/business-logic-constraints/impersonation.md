# Business logic constraints for audited admin impersonation

These rules define the optional browser support-session capability. The
capability is disabled by default with `IMPERSONATION_ENABLED=false`.

## Identity model

- **BLC-IMP-001:** An impersonation record has one immutable actor session,
  actor user, subject user, opaque credential hash, and creation timestamp. The
  raw credential is returned only in the `HttpOnly` browser cookie and is never
  persisted or logged.
- **BLC-IMP-002:** The actor is the user authenticated by the primary
  `sso_session` credential. The subject is the effective user in
  `AuthorizationContext::user`; normal resource authorization and team ACLs
  use the subject only. Actor metadata remains available for stop and audit.
- **BLC-IMP-003:** The start action is platform-admin-only and may target any
  existing user, including another platform admin. It does not grant the
  subject permissions beyond the subject's normal ACL.

## Cookies and credentials

- **BLC-IMP-004:** `POST /api/v1/users/{user_id}/impersonation` creates a
  server-backed record bound to the actor's current session and sets only the
  opaque `wv_impersonation` session cookie. The cookie is `HttpOnly`,
  `SameSite=Lax`, path `/`, and `Secure` when `COOKIE_SECURE=true`.
- **BLC-IMP-005:** A browser impersonation cookie is ignored for every request
  carrying `Authorization: Bearer ...`; bearer requests use only their bearer
  session.
- **BLC-IMP-006:** A cookie is active only when its hash resolves to a record
  bound to the authenticated primary session and actor user. Arbitrary,
  copied, stale, or mismatched values cannot select a subject.

## Lifecycle and revocation

- **BLC-IMP-007:** `GET /auth/impersonation/current` reports only enabled state
  and subject metadata; it never returns a raw credential. It clears stale
  browser state without changing the primary session.
- **BLC-IMP-008:** `POST /auth/impersonation/stop` is idempotent, verifies the
  original actor session independently, deletes the matching record, and
  clears only `wv_impersonation`. Primary logout remains separate.
- **BLC-IMP-009:** Deleting an actor session or either actor/subject user
  deletes its related impersonation records. When the feature flag is disabled
  at startup, all existing impersonation records are invalidated and stale
  cookies fall back to the primary session.
- **BLC-IMP-010:** There is no automatic impersonation TTL and no one-active-
  session limit. Records remain revocable server state until stopped or
  invalidated.

## Sessions, audit, and UI

- **BLC-IMP-011:** Subject session listing and revocation remain subject-scoped.
  Current-session and current-session-metrics endpoints do not expose the
  actor's primary credential or falsely present it as a subject-owned session.
- **BLC-IMP-012:** Each impersonated HTTP audit row retains the effective
  subject in `user_id` and links the actor and impersonation record separately.
  `audit.impersonation.started`, `.stopped`, and `.invalidated` identify actor,
  subject, and record where available; raw credentials never appear in logs.
- **BLC-IMP-013:** The authenticated hub shows a persistent target banner and
  explicit Stop control. Starting and stopping clears React Query and Dexie
  state before reloading so cached data cannot cross identity boundaries.
