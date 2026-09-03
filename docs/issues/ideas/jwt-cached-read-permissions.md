---
title: "Speed reads with JWT-cached permissions"
summary: "Cut authenticated read latency by serving from cached JWT permissions while re-checking live permissions in parallel, after request-time baselines exist."
area: "Auth"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "both"
change_type: "improvement to an existing capability"
personas:
  - "maintainer"
  - "operator"
  - "musician"
primary_persona: "maintainer"
benefit: "Authenticated reads can complete without waiting on a full live permission load when cached grants still match, with a measured fallback when they do not."

clarity:
  score: 3
  reason: "The optimistic-cache-plus-recheck pattern is stated; token shape, invalidation, and the monitoring prerequisite are still open."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Every authenticated request currently loads session, user, and teams before work starts; faster reads would be a meaningful backend improvement if latency is actually dominated there."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 4
  reason: "Session-backed auth sits on nearly all private API traffic, not a niche path."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 1
  reason: "No measured proof yet that session permission loading is the dominant read cost; the idea itself requires endpoint timing first."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Lower API latency supports the core product, but this is an internal auth optimization rather than a user-facing capability."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "Replacing opaque session tokens with JWTs, cache invalidation, parallel revalidation, OpenAPI/BLC updates, and auth tests is on the order of thousands to tens of thousands of lines."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 4
  reason: "Auth, revocation, and permission stale-read bugs are high-severity; stale grants could leak or deny access."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Speed reads with JWT-cached permissions

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 3 / 5 | The optimistic-cache-plus-recheck pattern is stated; token shape, invalidation, and the monitoring prerequisite are still open. |
| Impact | 3 / 5 | Every authenticated request currently loads session, user, and teams before work starts; faster reads would be a meaningful backend improvement if latency is actually dominated there. |
| Reach | 4 / 5 | Session-backed auth sits on nearly all private API traffic, not a niche path. |
| Evidence | 1 / 5 | No measured proof yet that session permission loading is the dominant read cost; the idea itself requires endpoint timing first. |
| Strategic fit | 3 / 5 | Lower API latency supports the core product, but this is an internal auth optimization rather than a user-facing capability. |
| Effort | 4 / 5 | Replacing opaque session tokens with JWTs, cache invalidation, parallel revalidation, OpenAPI/BLC updates, and auth tests is on the order of thousands to tens of thousands of lines. |
| Delivery risk | 4 / 5 | Auth, revocation, and permission stale-read bugs are high-severity; stale grants could leak or deny access. |

## Problem

Authenticated `/api/v1` requests validate an opaque Bearer session token and load session, user, and team membership in one database round-trip before the handler runs. If that load dominates read latency, every library and player call pays it even when permissions have not changed.

## Proposed outcome

Issue JWTs that carry cached read permissions. Serve reads from the cached grants immediately, and in parallel re-evaluate live permissions. If grants are unchanged, the request stays fast; if they changed, the request may be slightly slower and must not keep using stale grants. Before any auth change, collect per-endpoint request-time monitoring so the before/after effect is visible.

**In scope**

- Per-endpoint request-time baselines as a prerequisite.
- JWT (or equivalent) tokens that cache read permissions for authenticated reads.
- Parallel live permission re-evaluation and a defined stale-grant behavior.
- Session revocation and permission-change invalidation.

**Out of scope**

- Changing OIDC or email OTP login UX.
- Caching write/mutation authorization.

## Success criteria

- Operators can compare read latency by endpoint before and after the change.
- Unchanged permissions make typical authenticated reads faster than today's session load.
- Changed or revoked permissions never authorize a request that live evaluation would deny.

## Planning notes

- **Approach:** Keep today's session model as the source of truth until monitoring shows the load is worth replacing; then add a signed token with a short permission snapshot and a recheck path.
- **Dependencies:** Request-time visibility on current session-backed routes; updates to authentication and session business-logic constraints.
- **Open questions:** What is in the cached grant set? How is revocation propagated? Do writes still require a live session load? How long may a stale read be used?
- **Risks and mitigations:** Stale permissions are a security bug; default to denying when live evaluation disagrees, keep tokens short-lived, and test revocation before rollout.
