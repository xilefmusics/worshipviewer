---
title: "Show how often a song appears in setlists"
summary: "Give teams statistics on which songs are used in setlists so planning and repertoire decisions are based on history."
area: "General"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "new capability or area"
personas:
  - "worship leader"
  - "content maintainer"
primary_persona: "worship leader"
benefit: "Leaders can see overused or neglected songs instead of relying on memory."

clarity:
  score: 2
  reason: "A song-in-setlist statistic is named; windows, last-used vs count, team scope, and UI placement are unspecified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Repertoire rotation is a real weekly planning pain for leaders with large catalogs."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Worship leaders and librarians; not musicians who only open the player."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 1
  reason: "Setlists store song items but no usage analytics product exists; demand is the idea."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Supports planned sets using the team's own history, which is core repertoire work."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 3
  reason: "Aggregation query or derived table, song/setlist UI, and tests are around a thousand lines if scoped to counts."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 2
  reason: "Read-only aggregates over existing setlist items are limited risk; performance on large libraries needs care."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Show how often a song appears in setlists

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | A song-in-setlist statistic is named; windows, last-used vs count, team scope, and UI placement are unspecified. |
| Impact | 3 / 5 | Repertoire rotation is a real weekly planning pain for leaders with large catalogs. |
| Reach | 3 / 5 | Worship leaders and librarians; not musicians who only open the player. |
| Evidence | 1 / 5 | Setlists store song items but no usage analytics product exists; demand is the idea. |
| Strategic fit | 3 / 5 | Supports planned sets using the team's own history, which is core repertoire work. |
| Effort | 3 / 5 | Aggregation query or derived table, song/setlist UI, and tests are around a thousand lines if scoped to counts. |
| Delivery risk | 2 / 5 | Read-only aggregates over existing setlist items are limited risk; performance on large libraries needs care. |

## Problem

Songs appear in many setlists, but the product does not show how often or how recently. Leaders cannot see rotation without opening setlists one by one.

## Proposed outcome

A user can see song-in-setlist statistics (for example count and last appearance) for teams they can read.

**In scope**

- Defined metrics (count, last used, and/or windowed count).
- Display on song detail and/or hub.
- Scope limited to readable setlists/teams.

**Out of scope**

- Congregation attendance or CCLI reporting unless specified later.
- Room play counts, unless included as a separate metric.

## Success criteria

- Opening a song shows its setlist usage according to the chosen metric.
- Songs in zero setlists show a clear empty state.
- Users cannot infer setlists they are not allowed to read.

## Planning notes

- **Approach:** Start with a count of setlist `items` song links per readable team; add last-used only if setlists gain a service date.
- **Dependencies:** Setlist items model; optional date field if "last Sunday" is required.
- **Open questions:** Do untitled/draft setlists count? Per team or global to the user? Need a service date on setlists?
- **Risks and mitigations:** Heavy scans; pre-aggregate or query with limits, and respect team ACL like other list endpoints.
