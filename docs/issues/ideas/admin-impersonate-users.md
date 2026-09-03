---
title: "Let admins impersonate users"
summary: "Give platform administrators a controlled way to act as another user for support and debugging, with audit, rather than sharing passwords or guessing their view."
area: "Admin"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "both"
change_type: "new capability or area"
personas:
  - "administrator"
  - "operator"
primary_persona: "administrator"
benefit: "Admins can reproduce a user's permissions and UI to fix issues without weakening normal team ACLs."

clarity:
  score: 3
  reason: "Impersonation as a support tool is understood; UI vs using existing admin session-create, duration, and audit details still need decisions."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Support for permission-scoped bugs is painful today because platform admin does not bypass team library ACL."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 2
  reason: "Only platform administrators; users are subjects of the action, not daily operators of it."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 2
  reason: "Admins can already POST sessions for a user, but there is no in-app impersonation flow or documented support procedure; BLC-ADMIN-001 blocks admin library bypass."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Safer support without breaking the admin-is-not-omniscient library rule supports operating the product."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 3
  reason: "Banner UI, audit events, session binding, and tests are around a thousand lines; raw session minting already exists."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 4
  reason: "Impersonation is a privileged path: missing audit, sticky sessions, or accidental production use is a serious security incident."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Let admins impersonate users

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 3 / 5 | Impersonation as a support tool is understood; UI vs using existing admin session-create, duration, and audit details still need decisions. |
| Impact | 3 / 5 | Support for permission-scoped bugs is painful today because platform admin does not bypass team library ACL. |
| Reach | 2 / 5 | Only platform administrators; users are subjects of the action, not daily operators of it. |
| Evidence | 2 / 5 | Admins can already POST sessions for a user, but there is no in-app impersonation flow or documented support procedure; BLC-ADMIN-001 blocks admin library bypass. |
| Strategic fit | 3 / 5 | Safer support without breaking the admin-is-not-omniscient library rule supports operating the product. |
| Effort | 3 / 5 | Banner UI, audit events, session binding, and tests are around a thousand lines; raw session minting already exists. |
| Delivery risk | 4 / 5 | Impersonation is a privileged path: missing audit, sticky sessions, or accidental production use is a serious security incident. |

## Problem

Platform admins do not get extra library read/write from `role=admin`. That is correct for privacy, but it makes support hard: the admin cannot see the user's hub. Admins can create sessions for a user via `POST /users/{user_id}/sessions`, which is a sharp, easy-to-misuse form of impersonation without a dedicated UI, banner, or support audit trail.

## Proposed outcome

An administrator can start a clearly marked impersonation session as another user, act with that user's permissions, and stop it, with audit of who impersonated whom.

**In scope**

- Start/stop impersonation from the admin surface.
- Visible "you are impersonating" chrome and a short TTL.
- Audit events distinct from normal logins.

**Out of scope**

- Granting platform admin blanket library access (that would violate BLC-ADMIN-001).
- Impersonating into production without a policy (staging-only is an option).

## Success criteria

- An admin can reproduce a user's 404/empty hub by impersonating them.
- The impersonated user can see new sessions and revoke them.
- Every impersonation start/stop is auditable.

## Planning notes

- **Approach:** Wrap existing admin session-create in a first-class flow with a banner and `audit.*` events; do not add a hidden backdoor ACL.
- **Dependencies:** Session APIs (BLC-USER-011, BLC-SESS-006); admin dashboard; monitoring/audit.
- **Open questions:** Allowed only in non-production? Require a ticket id? Can the admin impersonate another admin?
- **Risks and mitigations:** Session leftover in a browser; force a distinct cookie, short TTL, and prominent stop control; disable when `WORSHIP_PRODUCTION` if that is the policy.
