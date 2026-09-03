---
title: "Play multi-track sessions from the player"
summary: "Let the player run multiple synchronized stems (click, cues, instruments) so a prepared band can mix tracks without leaving Worship Viewer."
area: "Player"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "new capability or area"
personas:
  - "musician"
  - "worship leader"
  - "AV team"
primary_persona: "musician"
benefit: "Teams that use multi-track playback can start, mute, and hear stems from the same song source as the chart."

clarity:
  score: 2
  reason: "Multi-track sampling is named; stem count, mixer UI, routing, and authoring format are unspecified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 4
  reason: "Replacing a dedicated multi-track player would remove a major tool switch for track-based teams."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 2
  reason: "A smaller group of production-heavy teams; most churches will not mix stems in-app."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 1
  reason: "No stem mixer exists; this extends the sampling family beyond documented click/cue mentions."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Advances the single-source and prepared-set principles, but is a large adjacent product (almost a DAW)."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 5
  reason: "Mixer, sync engine, uploads, routing, and tests exceed a typical feature and look like more than 15k lines with docs and QA."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 4
  reason: "Timing, memory, and output routing on mobile browsers are major unknowns; easy to ship something unusable live."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Play multi-track sessions from the player

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | Multi-track sampling is named; stem count, mixer UI, routing, and authoring format are unspecified. |
| Impact | 4 / 5 | Replacing a dedicated multi-track player would remove a major tool switch for track-based teams. |
| Reach | 2 / 5 | A smaller group of production-heavy teams; most churches will not mix stems in-app. |
| Evidence | 1 / 5 | No stem mixer exists; this extends the sampling family beyond documented click/cue mentions. |
| Strategic fit | 3 / 5 | Advances the single-source and prepared-set principles, but is a large adjacent product (almost a DAW). |
| Effort | 5 / 5 | Mixer, sync engine, uploads, routing, and tests exceed a typical feature and look like more than 15k lines with docs and QA. |
| Delivery risk | 4 / 5 | Timing, memory, and output routing on mobile browsers are major unknowns; easy to ship something unusable live. |

## Problem

Click, cue, pad, and single-track ideas each solve one layer. Teams that already run multi-track sessions still need a dedicated player to mute stems and hit start together.

## Proposed outcome

The player can run multiple synchronized tracks for a song with basic per-stem mute/level, sharing one transport.

**In scope**

- Multiple audio stems attached to a song.
- Shared start/stop and mute (minimum mixer).
- Coordination with click/cue if those exist.

**Out of scope**

- Full DAW editing, recording, or plugin hosting.
- Hardware control surfaces, unless specified later.

## Success criteria

- All stems stay in sync when started together.
- Muting a stem does not stop the others.
- Devices that cannot handle the mix fail with a clear limit, not audio glitches as the only signal.

## Planning notes

- **Approach:** Land click + single track first; treat multi-track as the same transport with N buffers.
- **Dependencies:** [player-sampling-click-track.md](player-sampling-click-track.md), [player-sampling-single-track.md](player-sampling-single-track.md), audio blobs (H-1).
- **Open questions:** Max stems? Upload as zip of WAVs? Per-participant mixes in Rooms?
- **Risks and mitigations:** Mobile memory and decode limits; cap stem count, prefer a server-mixed fallback, and test on iPhone.
