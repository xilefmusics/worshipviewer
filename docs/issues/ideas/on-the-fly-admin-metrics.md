---
title: "Calculate a second generation of admin metrics on the fly"
summary: "Give administrators fresher operational metrics by computing a new metrics generation at request time instead of relying only on daily cached aggregates."
area: "Admin"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "maintainer"
change_type: "improvement to an existing capability"
personas:
  - "administrator"
  - "maintainer"
primary_persona: "administrator"
benefit: "Admins can inspect current operational metrics without waiting for the next persisted daily rollup."

clarity:
  score: 2
  reason: "Which metrics, which windows, and how this differs from today's dynamic 'today' calculation are unspecified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 2
  reason: "This would improve admin observability but does not change a worship workflow."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 2
  reason: "Only platform administrators use monitoring metrics."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 1
  reason: "No measured gap in the current daily-cache-plus-live-today metrics path is recorded."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Better admin metrics support operating the service, which is a core maintainer goal."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 3
  reason: "A new metrics generation needs query design, dashboard updates, tests, and likely OpenAPI/BLC changes around a thousand lines."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "On-the-fly aggregates over audit data can be slow or expensive; wrong definitions could mislead operators."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Calculate a second generation of admin metrics on the fly

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | Which metrics, which windows, and how this differs from today's dynamic 'today' calculation are unspecified. |
| Impact | 2 / 5 | This would improve admin observability but does not change a worship workflow. |
| Reach | 2 / 5 | Only platform administrators use monitoring metrics. |
| Evidence | 1 / 5 | No measured gap in the current daily-cache-plus-live-today metrics path is recorded. |
| Strategic fit | 3 / 5 | Better admin metrics support operating the service, which is a core maintainer goal. |
| Effort | 3 / 5 | A new metrics generation needs query design, dashboard updates, tests, and likely OpenAPI/BLC changes around a thousand lines. |
| Delivery risk | 3 / 5 | On-the-fly aggregates over audit data can be slow or expensive; wrong definitions could mislead operators. |

## Problem

Admin metrics today cache completed UTC days in the `metrics` table and calculate today dynamically. A second generation that is fully computed on the fly is not defined, so it is unclear which questions the current rollups cannot answer.

## Proposed outcome

Administrators get a second metrics generation computed at request time, so they can inspect fresher or differently sliced operational data than the persisted daily summaries.

**In scope**

- Defining the second-generation metric set and calculation windows.
- Serving those metrics from the admin monitoring API and dashboard.
- Keeping user identities out of aggregates, matching current monitoring rules.

**Out of scope**

- Replacing HTTP audit log storage.
- Public, non-admin analytics.

## Success criteria

- Admins can view the new on-the-fly metrics without waiting for a completed-day upsert.
- Calculations stay within acceptable request time and do not expose user or session identities.

## Planning notes

- **Approach:** Compare desired questions against `GET /api/v1/monitoring/metrics` and the admin dashboard, then add only the slices the daily cache cannot provide.
- **Dependencies:** Existing `http_request_audit` data and admin-only monitoring access.
- **Open questions:** Which metrics are in generation two? Live percentiles, current-hour traffic, error rates, or something else? Do they replace or sit beside daily rollups?
- **Risks and mitigations:** Heavy live scans can time out; bound windows, reuse summary tables, and measure query cost before exposing them in the UI.
