---
title: "Add AI assistance to the setlist editor"
summary: "Help worship leaders build or adjust setlists with AI suggestions while the leader keeps final control of order, keys, and items."
area: "Setlist Editor"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "new capability or area"
personas:
  - "worship leader"
  - "content maintainer"
primary_persona: "worship leader"
benefit: "Drafting a coherent set (flow, keys, duration) takes less trial and error."

clarity:
  score: 2
  reason: "AI integration is named; suggestion types (order, keys, new songs), data used, and apply UX are unspecified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Set building is a weekly leader workflow; good suggestions would matter if they respect the team's library."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Worship leaders who edit setlists, not every musician on a Room."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 1
  reason: "No setlist AI exists; demand is the submitted idea."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Supports planned-but-flexible sets; AI is assistance around an existing editor, not a new worship surface."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "Same class of work as song-editor AI plus library retrieval and setlist item rules (songs vs media)."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 4
  reason: "Suggestions that ignore team repertoire, licensing, or key comfort can ship bad sets; third-party data flow is sensitive."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Add AI assistance to the setlist editor

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | AI integration is named; suggestion types (order, keys, new songs), data used, and apply UX are unspecified. |
| Impact | 3 / 5 | Set building is a weekly leader workflow; good suggestions would matter if they respect the team's library. |
| Reach | 3 / 5 | Worship leaders who edit setlists, not every musician on a Room. |
| Evidence | 1 / 5 | No setlist AI exists; demand is the submitted idea. |
| Strategic fit | 3 / 5 | Supports planned-but-flexible sets; AI is assistance around an existing editor, not a new worship surface. |
| Effort | 4 / 5 | Same class of work as song-editor AI plus library retrieval and setlist item rules (songs vs media). |
| Delivery risk | 4 / 5 | Suggestions that ignore team repertoire, licensing, or key comfort can ship bad sets; third-party data flow is sensitive. |

## Problem

Setlists are assembled by hand: order, keys, media slots, and flow. There is no assistant that proposes a set from the team's library or critiques range/key motion.

## Proposed outcome

The setlist editor can offer AI suggestions (order, keys, or candidate songs from the readable library) that the leader applies item by item.

**In scope**

- Explicit assist actions in the setlist editor.
- Suggestions constrained to songs the caller can already read, unless a broader catalog is later approved.
- Review before mutating `items`.

**Out of scope**

- Auto-publishing a service without a human save.
- Replacing [setlist-range-planner.md](setlist-range-planner.md) unless the first AI job *is* range advice.

## Success criteria

- A leader can request suggestions and accept a subset into the setlist.
- Suggestions do not insert unreadable or cross-team songs.
- Media items are not dropped silently when songs are rewritten.

## Planning notes

- **Approach:** Pair with song-editor AI policy; first job might be "reorder for key motion" using only current `items`.
- **Dependencies:** Setlist `items` model; optional range planner; privacy policy.
- **Open questions:** Library-only vs web repertoire? Include Media? Theme/scripture prompts?
- **Risks and mitigations:** Hallucinated song titles; ground every suggestion in search results from the team's library.
