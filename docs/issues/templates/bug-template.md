---
title: "<short description of the incorrect behavior>"
summary: "<what breaks, who is affected, and when>"
area: "<Player, Song Editor, Setlist Editor, Admin, Infra, QA, etc.>"
status: "reported" # reported | triaged | ready for fix | in progress | resolved | cannot reproduce | won't fix
owner: null
last_reviewed: null # YYYY-MM-DD

personas:
  - "<worship leader, musician, presenter, AV team, viewer, administrator, operator, maintainer, etc.>"
primary_persona: "<main affected persona>"
environment:
  version: null
  deployment: null
  client: null

severity:
  score: null # 1-5; higher means more harmful
  reason: ""
  scale:
    1: "Cosmetic or negligible"
    2: "Minor inconvenience with an easy workaround"
    3: "Important workflow is impaired"
    4: "Core workflow is blocked or data may be corrupted"
    5: "Security, data loss, or widespread outage"
frequency:
  score: null # 1-5; higher means more frequent
  reason: ""
  scale:
    1: "Seen once or in a rare edge case"
    2: "Occasional"
    3: "Regular under specific conditions"
    4: "Most attempts"
    5: "Every attempt or continuously"
reproducibility:
  score: null # 1-5; higher means easier to reproduce
  reason: ""
  scale:
    1: "Not reproduced"
    2: "Intermittent with unknown trigger"
    3: "Reproduced with incomplete conditions"
    4: "Reliable steps known"
    5: "Minimal deterministic reproduction"
evidence:
  score: null # 1-5; higher means stronger evidence
  reason: ""
  scale:
    1: "Unverified report"
    2: "Single observation"
    3: "Repeated observations or useful diagnostics"
    4: "Confirmed with logs, tests, or repository evidence"
    5: "Failing automated regression test"
effort:
  score: null # 1: ~10, 2: ~100, 3: ~1k, 4: ~10k, 5: >15k lines
  reason: ""
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
fix_risk:
  score: null # 1-5; higher means more regression or rollout risk
  reason: ""
  scale:
    1: "Isolated and reversible"
    2: "Small, well-understood surface"
    3: "Meaningful regression surface"
    4: "Cross-cutting behavior or migration risk"
    5: "Fundamental uncertainty or high blast radius"
---

[← Back to issues README](../Readme.md)

# Bug: <short description of the incorrect behavior>

## Assessment

Scores are from 1 to 5. Higher means more severe, frequent, reproducible,
well-evidenced, costly, or risky, depending on the category.

| Category | Score | Reason |
|---|:---:|---|
| Severity | Choose 1-5 | |
| Frequency | Choose 1-5 | |
| Reproducibility | Choose 1-5 | |
| Evidence | Choose 1-5 | |
| Effort | Choose 1-5 | |
| Fix risk | Choose 1-5 | |

## Observed behavior

<!-- State what happens and its user-visible consequence. -->

## Expected behavior

<!-- State the intended behavior or invariant. -->

## Reproduction

**Prerequisites**

-

**Steps**

1.

**Actual result**

-

**Expected result**

-

## Evidence

<!-- Logs, screenshots, recordings, failing tests, affected versions, or code references. -->

-

## Workaround

<!-- Write "None known" when no workaround is known. -->

-

## Resolution notes

- **Likely cause:**
- **Affected surface:**
- **Fix direction:**
- **Regression coverage:**
- **Open questions:**

