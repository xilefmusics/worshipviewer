---
title: "Impersonate users through audited support sessions"
summary: "Give administrators a feature-flagged, reversible way to reproduce another user's experience without trusting a raw user-id cookie or losing the identity of the administrator who is acting."
area: "Admin"
status: "rough"
owner: null
last_reviewed: "2026-09-02"

primary_impact: "both"
change_type: "new capability or area"
personas:
  - "administrator"
  - "operator"
primary_persona: "administrator"
benefit: "Admins can reproduce user-specific permission and UI problems, including for other admins, while preserving normal ACLs, a reliable stop path, and an audit trail."

clarity:
  score: 4
  reason: "The support workflow and security approach are clear, and the product decisions on availability, target roles, notifications, action limits, duration, and concurrency are settled; exact flag and API mechanics remain planning details."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 4
  reason: "It removes a major support and debugging gap while keeping the existing rule that platform admins do not bypass team-library ACLs."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 2
  reason: "The feature is used by the small set of platform administrators and operators, although each use can unblock a high-cost support incident."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 3
  reason: "The repository already has an admin user directory, admin-created user sessions, HTTP request audit, and explicit admin ACL constraints, but no dedicated impersonation workflow or usage baseline."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 4
  reason: "A controlled support capability improves operability without weakening the product's privacy and team-membership model."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "A first-class flow needs a server-side record or session extension, actor-aware authorization and audit fields, API/OpenAPI changes, admin UI, banner/stop behavior, documentation, and backend/frontend tests; this is likely several thousand lines."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 4
  reason: "Impersonation is a privileged path with unlimited duration, full subject-authorized actions, and no target notification: confused actor versus subject identity, stale browser state, or missing audit data could become a security incident."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Impersonate users through audited support sessions

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 4 / 5 | The support workflow and security approach are clear, and the product decisions on availability, target roles, notifications, action limits, duration, and concurrency are settled; exact flag and API mechanics remain planning details. |
| Impact | 4 / 5 | It removes a major support and debugging gap while keeping the existing rule that platform admins do not bypass team-library ACLs. |
| Reach | 2 / 5 | The feature is used by the small set of platform administrators and operators, although each use can unblock a high-cost support incident. |
| Evidence | 3 / 5 | The repository already has an admin user directory, admin-created user sessions, HTTP request audit, and explicit admin ACL constraints, but no dedicated impersonation workflow or usage baseline. |
| Strategic fit | 4 / 5 | A controlled support capability improves operability without weakening the product's privacy and team-membership model. |
| Effort | 4 / 5 | A first-class flow needs a server-side record or session extension, actor-aware authorization and audit fields, API/OpenAPI changes, admin UI, banner/stop behavior, documentation, and backend/frontend tests; this is likely several thousand lines. |
| Delivery risk | 4 / 5 | Impersonation is a privileged path with unlimited duration, full subject-authorized actions, and no target notification: confused actor versus subject identity, stale browser state, or missing audit data could become a security incident. |

## Problem

The suggested `impersonate_user_id` cookie is not a good authority. A cookie value is client-controlled even when marked `HttpOnly`, so it must not be trusted as the identity switch. A raw user id also has no server-side expiry, revocation, actor binding, or audit identity.

The current backend already authenticates an opaque `sso_session`, supports admin-only session creation for another user, and derives team access from the authenticated user. Replacing `AuthorizationContext.user` in generic middleware would introduce an actor/subject identity mix-up: request logs and mutations could appear to come from the target, while the original admin session and the safe way to stop impersonating become ambiguous. It could also accidentally make admin-only routes depend on the target user's role.

## Proposed outcome

When enabled by a deployment feature flag, an administrator can start a clearly marked support session from the admin user directory, act with the target user's normal permissions, and stop it without signing in again. Any user—including another administrator—may be selected. The target's effective teams and library ACLs are used exactly as they would be for that user, with no additional sensitive-action block.

**In scope**

- A dedicated admin-only start endpoint and admin-dashboard action.
- A deployment feature flag that enables or disables the capability.
- An opaque, server-side impersonation credential bound to the administrator's existing session and the target user; the browser may carry that credential in a separate `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- Separate actor (administrator) and subject (impersonated user) context throughout authorization, request audit, and structured audit events.
- A prominent impersonation banner and an explicit stop endpoint that clears the impersonation state while retaining the original admin login.
- No automatic duration limit and no one-active-session limit; the state remains until explicit stop or revocation.
- Revocation when the actor session or target account is deleted, on explicit stop, and according to the feature flag's disable semantics.
- API and UI tests for authorization, cookie handling, ACL scoping, audit correlation, and recovery from stale impersonation state.

**Out of scope**

- A raw user-id cookie as the source of truth.
- Granting platform admins blanket access to another user's private libraries outside the impersonated subject's ACL.
- Making bearer-token/API-client requests implicitly impersonate based on a browser cookie.
- Sharing passwords or impersonating users without visible product state and audit.
- Target notifications or support-ticket/reason capture as a prerequisite.

## Success criteria

- From the admin dashboard, an admin can enter a chosen user's experience and see only the teams, resources, and actions that user could normally see.
- The target may be another admin, and all actions permitted by the target's normal authorization remain available; the feature does not add a sensitive-action block or an admin ACL bypass.
- An arbitrary or copied impersonation-cookie value cannot select a user unless it resolves to an active server-side record bound to the authenticated admin session.
- The admin can always stop impersonating and return to the original admin session without reauthentication; logout and stale-cookie behavior are deterministic.
- While impersonating a non-admin, admin-only screens and operations are not available through the effective user context, but the stop path remains available to the verified actor; impersonating an admin preserves that subject's normal admin access.
- The deployment can disable the capability through the feature flag, with active-session behavior defined and tested.
- Start, stop, expiry, and relevant requests can be correlated to both `actor_user_id` and `subject_user_id` in audit data.
- Backend business-logic constraints document the actor/subject semantics and public API tests cover the security boundary.

## Planning notes

- **Approach:** Treat the cookie only as a transport for an opaque server-side impersonation session. Authenticate the normal admin session first, validate the bound impersonation record, then load the target's authorization context while retaining the actor context separately. Do not overwrite the only `AuthorizationContext` identity. Apply no extra mutation restriction beyond the target's normal authorization; the actor identity is used for the stop path and audit, not to grant target-bypassing access.
- **Dependencies:** Existing `RequireUser`/`RequireAdmin` middleware, `sso_session` cookie configuration, session repository/service, admin users route and table, HTTP audit persistence, structured audit catalog, OpenAPI synchronization, and the platform-admin/session business-logic constraints.
- **Open questions:** What should the feature-flag key and default be, and should disabling it immediately invalidate active impersonation sessions or only prevent new ones? Exact endpoint names, persistence shape, and UI copy remain implementation choices.
- **Risks and mitigations:** Use opaque random credentials and server-side revocation; bind the record to the original admin session; keep actor and subject fields distinct; show a persistent banner and stop control; never log raw credentials; make unlimited lifetime and multiple concurrent sessions explicit in the UI and audit trail; clear impersonation state with deterministic, tested semantics.
