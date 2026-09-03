---
title: "Let participants queue the next Room songs"
summary: "Give Room participants a propose-and-vote queue for upcoming songs while the host keeps final say on what plays next."
area: "Rooms"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "new capability or area"
personas:
  - "musician"
  - "worship leader"
  - "viewer"
primary_persona: "musician"
benefit: "Band members can suggest and rank what should come next without taking control away from the host."

clarity:
  score: 2
  reason: "Propose/upvote/downvote plus host veto is stated; eligibility, library scope, duplicate songs, and how the queue interacts with the current snapshot are not."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "A shared next-song queue would change how collaborative or spontaneous Rooms run."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Useful for multi-participant rooms; unused by solo hosts or library-only users."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 1
  reason: "Need is the submitted idea; no recorded Room sessions asking for a vote queue."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Supports staying flexible during a live set, which is a core product principle, without replacing host control."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "New room state, votes, permissions, realtime events, UI, and tests are a multi-thousand-line feature."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "Queue items must stay within the captured snapshot or open a new content model; vote abuse and host/participant conflict need rules."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Let participants queue the next Room songs

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | Propose/upvote/downvote plus host veto is stated; eligibility, library scope, duplicate songs, and how the queue interacts with the current snapshot are not. |
| Impact | 3 / 5 | A shared next-song queue would change how collaborative or spontaneous Rooms run. |
| Reach | 3 / 5 | Useful for multi-participant rooms; unused by solo hosts or library-only users. |
| Evidence | 1 / 5 | Need is the submitted idea; no recorded Room sessions asking for a vote queue. |
| Strategic fit | 3 / 5 | Supports staying flexible during a live set, which is a core product principle, without replacing host control. |
| Effort | 4 / 5 | New room state, votes, permissions, realtime events, UI, and tests are a multi-thousand-line feature. |
| Delivery risk | 3 / 5 | Queue items must stay within the captured snapshot or open a new content model; vote abuse and host/participant conflict need rules. |

## Problem

Rooms give only the host control of the current item. Participants cannot propose or rank what should play next, so spontaneous collaboration happens off-app.

## Proposed outcome

Participants can propose songs onto a next-up queue, upvote and downvote those proposals, and the host still chooses the actual next song.

**In scope**

- A room-scoped queue of proposed next songs.
- Participant propose, upvote, and downvote.
- Host final say on advancing to a queued song.

**Out of scope**

- Replacing host musical control (key, language, current item) with majority vote.
- A global social feed outside a room.

## Success criteria

- Participants in an open room can add a proposal and change their vote.
- The host can accept, skip, or ignore the queue when choosing the next song.
- Guests without permission cannot mutate the queue if the room disables that.

## Planning notes

- **Approach:** Add queue state to the room snapshot/deltas; keep the host as the only client that can apply `item_index` changes.
- **Dependencies:** Room snapshot model currently captures content at creation; proposing songs outside that snapshot may need a new content rule.
- **Open questions:** Can proposals include songs not already in the room snapshot? Who may propose (signed-in members vs anonymous guests)? One vote per participant? What happens to the queue when the current song changes?
- **Risks and mitigations:** Snapshot-only rooms cannot add new songs without a model change; start with reordering items already in the room if full library search is too large.
