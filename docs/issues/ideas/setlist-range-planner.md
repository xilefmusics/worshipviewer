---
title: "Plan setlists with a range planner"
summary: "Help worship leaders plan a set against a musical or vocal range so consecutive songs stay singable and playable."
area: "Setlist Editor"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "new capability or area"
personas:
  - "worship leader"
  - "musician"
primary_persona: "worship leader"
benefit: "Sets can be checked for key/vocal (or other) range before Sunday instead of discovering strain live."

clarity:
  score: 1
  reason: "Range planner is only a name; vocal range vs instrument range vs calendar date range is not specified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "If it means vocal/key comfort across a set, that is a meaningful planning workflow; if it means dates, impact is different and still undefined."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Worship leaders building sets; singers would benefit if the range is vocal."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 1
  reason: "No range data model or planner UI exists; the idea has no supporting detail."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Fits prepared setlists; blocked on defining what range means."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 3
  reason: "Once range is defined, editor UI plus song metadata and tests are likely around a thousand lines; a wrong definition would waste that work."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "Wrong range definition (vocal vs calendar) would build the wrong feature; song tessitura data may not exist."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Plan setlists with a range planner

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 1 / 5 | Range planner is only a name; vocal range vs instrument range vs calendar date range is not specified. |
| Impact | 3 / 5 | If it means vocal/key comfort across a set, that is a meaningful planning workflow; if it means dates, impact is different and still undefined. |
| Reach | 3 / 5 | Worship leaders building sets; singers would benefit if the range is vocal. |
| Evidence | 1 / 5 | No range data model or planner UI exists; the idea has no supporting detail. |
| Strategic fit | 3 / 5 | Fits prepared setlists; blocked on defining what range means. |
| Effort | 3 / 5 | Once range is defined, editor UI plus song metadata and tests are likely around a thousand lines; a wrong definition would waste that work. |
| Delivery risk | 3 / 5 | Wrong range definition (vocal vs calendar) would build the wrong feature; song tessitura data may not exist. |

## Problem

Setlist editing orders songs and keys but does not help a leader see whether the set sits in a comfortable vocal or instrumental range, or (if that was the intent) plan across a date range.

## Proposed outcome

The setlist editor includes a range planner that visualizes the chosen kind of range and flags problems before the set is locked.

**In scope**

- A single, named definition of "range" for v1.
- Visualization or warnings in the setlist editor.
- Using existing key/tempo fields if they are enough, or calling out new song metadata.

**Out of scope**

- Full AI set building ([setlist-editor-ai-integration.md](setlist-editor-ai-integration.md)), except as a later consumer of the same data.

## Success criteria

- Success criteria depend on the range definition; at minimum the leader can see the planned range for the current `items` list and change keys to improve it.

## Planning notes

- **Approach:** Resolve the open question first; the most common worship meaning is vocal/key tessitura across the set, not a calendar.
- **Dependencies:** Song key (and possibly new high/low melody fields); setlist item keys.
- **Open questions:** Vocal, guitar, or date range? Whose voice (leader, congregation)? Transpose suggestions vs display-only?
- **Risks and mitigations:** Building a calendar planner when vocal range was meant; write a one-sentence v1 definition before schema work.
