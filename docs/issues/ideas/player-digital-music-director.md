---
title: "Add a digital music director in the player"
summary: "Give teams an in-player music-director layer that can call songs, cues, and timing so a human MD is not the only source of live direction."
area: "Player"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "new capability or area"
personas:
  - "musician"
  - "worship leader"
primary_persona: "worship leader"
benefit: "Prepared direction (cues, count-ins, arrangement calls) can run from the player when a live MD is unavailable or wants a backup."

clarity:
  score: 1
  reason: "Digital MD is only a label; features, autonomy vs click/cues, and relationship to sampling ideas are unknown."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 4
  reason: "If it means a full directed playback experience, it would remove a major live-coordination pain for track-based teams."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Relevant to bands that use an MD or tracks; less so to fully spontaneous teams."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 1
  reason: "No MD product surface exists; the idea is a name without user stories."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 4
  reason: "Matches 'plan down to the beat but stay flexible' if the MD layer can be overridden live."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 5
  reason: "A real MD product sits on click, cues, tracks, and room sync and is larger than a single feature."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 5
  reason: "Scope, live reliability, and overlap with sampling ideas are fundamental unknowns."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Add a digital music director in the player

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 1 / 5 | Digital MD is only a label; features, autonomy vs click/cues, and relationship to sampling ideas are unknown. |
| Impact | 4 / 5 | If it means a full directed playback experience, it would remove a major live-coordination pain for track-based teams. |
| Reach | 3 / 5 | Relevant to bands that use an MD or tracks; less so to fully spontaneous teams. |
| Evidence | 1 / 5 | No MD product surface exists; the idea is a name without user stories. |
| Strategic fit | 4 / 5 | Matches 'plan down to the beat but stay flexible' if the MD layer can be overridden live. |
| Effort | 5 / 5 | A real MD product sits on click, cues, tracks, and room sync and is larger than a single feature. |
| Delivery risk | 5 / 5 | Scope, live reliability, and overlap with sampling ideas are fundamental unknowns. |

## Problem

Live direction (count-ins, arrangement calls, when to go) is a person or a separate tracks rig. Worship Viewer has no MD layer that can run those calls from the song/set.

## Proposed outcome

A digital music-director experience in the player can provide timed direction so the band can follow a prepared plan, with a human still able to break out.

**In scope**

- Defining what "digital MD" means for v1 (likely orchestration of click, cues, and section calls).
- Player UI for start, follow, and override.
- Behavior when the Spirit-led breakout happens (stop or ignore plan).

**Out of scope**

- Replacing a human leader's pastoral role.
- Shipping all sampling epics as one unscoped blob without sequencing.

## Success criteria

- Success criteria cannot be finalized until the v1 MD job is named (cues only vs full stem+call session).
- Whatever ships must be overridable instantly so a live set is not trapped in automation.

## Planning notes

- **Approach:** Treat this as an umbrella over [player-sampling-click-track.md](player-sampling-click-track.md) and [player-sampling-cue-track.md](player-sampling-cue-track.md); do not build a parallel transport.
- **Dependencies:** Sampling transport; possibly Rooms for shared start.
- **Open questions:** Is this a product name for cues+click, or a separate conductor UI? Who arms/starts it? How does spontaneous skip work?
- **Risks and mitigations:** Scope explosion; write a one-page v1 story before any implementation, and park until click/cue exist.
