---
title: "Use dynamic backgrounds in AV mode"
summary: "Let AV projection use motion or reactive backgrounds rather than only static presets or still custom images."
area: "AV"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "new capability or area"
personas:
  - "AV team"
  - "presenter"
  - "viewer"
primary_persona: "AV team"
benefit: "Projection can feel alive (motion, gentle animation, or audio-reactive looks) without a second visual app."

clarity:
  score: 1
  reason: "Dynamic backgrounds are unnamed beyond the adjective; video vs shader vs audio-reactive vs timed loops is unknown."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Motion backgrounds are a common AV expectation; impact depends entirely on what 'dynamic' means."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "AV operators and congregation-facing screens; unused in chords-only rooms."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 1
  reason: "Gaps discuss custom media and presets, not a defined dynamic-background product."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 2
  reason: "Visual polish for AV; loosely aligned unless it stays tied to the same song/projection protocol."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "Video or GPU backgrounds, performance on modest church PCs, and protocol work are large."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 4
  reason: "Frame rate, battery, and projection-window GPU cost can make Sunday output unusable."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Use dynamic backgrounds in AV mode

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 1 / 5 | Dynamic backgrounds are unnamed beyond the adjective; video vs shader vs audio-reactive vs timed loops is unknown. |
| Impact | 3 / 5 | Motion backgrounds are a common AV expectation; impact depends entirely on what 'dynamic' means. |
| Reach | 3 / 5 | AV operators and congregation-facing screens; unused in chords-only rooms. |
| Evidence | 1 / 5 | Gaps discuss custom media and presets, not a defined dynamic-background product. |
| Strategic fit | 2 / 5 | Visual polish for AV; loosely aligned unless it stays tied to the same song/projection protocol. |
| Effort | 4 / 5 | Video or GPU backgrounds, performance on modest church PCs, and protocol work are large. |
| Delivery risk | 4 / 5 | Frame rate, battery, and projection-window GPU cost can make Sunday output unusable. |

## Problem

AV backgrounds are static presets (custom stills are a separate idea). There is no motion or reactive background layer for lyric projection.

## Proposed outcome

AV mode can use dynamic backgrounds that move or change over time while lyrics stay readable.

**In scope**

- A defined v1 of "dynamic" (looping video, CSS/canvas motion, or similar).
- Operator control to start/stop or pick a look.
- Readability of lyrics on top.

**Out of scope**

- Full VJ software.
- Custom stills ([av-custom-backgrounds.md](av-custom-backgrounds.md)) except as a related layer.

## Success criteria

- Projection remains readable at a typical sanctuary viewing distance.
- A low-power machine can run the v1 look without dropping to an unusable frame rate.
- Operators can fall back to a static preset instantly.

## Planning notes

- **Approach:** Specify v1 as looping muted video or a small set of CSS animations before shaders or audio-reactive looks.
- **Dependencies:** Custom backgrounds/media delivery; AV projection window.
- **Open questions:** Video file vs generative? Sync motion across Room projectors? Audio-reactive to FOH or click?
- **Risks and mitigations:** GPU melt; cap resolution, offer "reduce motion", and test on integrated graphics.
