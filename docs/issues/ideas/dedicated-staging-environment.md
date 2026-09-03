---
title: "Set up a dedicated staging environment"
summary: "Give the project a proper staging deployment that mirrors production closely enough to validate releases before they reach users."
area: "QA"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "maintainer"
change_type: "new capability or area"
personas:
  - "maintainer"
  - "operator"
primary_persona: "maintainer"
benefit: "Risky changes can be exercised against a production-like stack before production traffic sees them."

clarity:
  score: 2
  reason: "A dedicated staging environment is the goal; hosting, data, auth providers, and promotion rules are unspecified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "A real staging stack reduces production-only surprises for deploys, migrations, and auth."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 2
  reason: "Used by maintainers and operators, not by worship teams in normal use."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 2
  reason: "Ops docs mention smoke auth on staging, but the repo does not define a dedicated staging stack or promotion path."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 4
  reason: "Safer releases are a priority for a hosted worship app with migrations and auth."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 3
  reason: "Environment, secrets, data policy, CI deploy, and runbooks are more than a small config change and typically around a thousand lines of infra-as-code and docs."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "Staging that shares production data, IdP, or secrets can leak or drift; an unused staging env decays quickly."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Set up a dedicated staging environment

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | A dedicated staging environment is the goal; hosting, data, auth providers, and promotion rules are unspecified. |
| Impact | 3 / 5 | A real staging stack reduces production-only surprises for deploys, migrations, and auth. |
| Reach | 2 / 5 | Used by maintainers and operators, not by worship teams in normal use. |
| Evidence | 2 / 5 | Ops docs mention smoke auth on staging, but the repo does not define a dedicated staging stack or promotion path. |
| Strategic fit | 4 / 5 | Safer releases are a priority for a hosted worship app with migrations and auth. |
| Effort | 3 / 5 | Environment, secrets, data policy, CI deploy, and runbooks are more than a small config change and typically around a thousand lines of infra-as-code and docs. |
| Delivery risk | 3 / 5 | Staging that shares production data, IdP, or secrets can leak or drift; an unused staging env decays quickly. |

## Problem

There is no documented dedicated staging stack. Ops smoke steps mention staging, while local Playwright and Docker/Venom cover other layers. Production remains the first full environment for some classes of change.

## Proposed outcome

A staging environment exists that is close enough to production (app, database, blobs, auth) to validate a release before production promotion.

**In scope**

- A durable staging URL and deploy path.
- Separate config, secrets, and data from production.
- Runbooks for promote, smoke, and rollback against staging.

**Out of scope**

- Replacing local Playwright or Docker/Venom as developer gates.
- Production data cloning unless a sanitized subset is explicitly chosen later.

## Success criteria

- Maintainers can deploy a candidate build to staging without touching production.
- Staging smoke (auth, library, blob) is documented and repeatable.
- Staging cannot use production secrets or write production data.

## Planning notes

- **Approach:** Mirror the production hosting model (for example Cloud Run + SurrealDB + blob disk) with a separate project/service and `WORSHIP_PRODUCTION` appropriate for staging.
- **Dependencies:** Hosting account, OIDC/OTP mail, and image registry choice ([publish-images-to-ghcr.md](publish-images-to-ghcr.md)).
- **Open questions:** Shared or isolated IdP? Synthetic data only? Auto-deploy `main` vs manual promote? Who has access?
- **Risks and mitigations:** Data leaks and drift; isolate credentials, reset data on a schedule, and fail CI/docs if staging is undefined.
