---
title: "Play cue tracks from the player"
summary: "Let musicians hear spoken or musical cues aligned to the song they are playing, from the same source as the chart."
area: "Player"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "new capability or area"
personas:
  - "musician"
  - "worship leader"
primary_persona: "musician"
benefit: "Section changes and reminders can be heard in-ear at the right moment without a separate cue player."

clarity:
  score: 2
  reason: "Cue sampling is named; cue format, authoring, and sync to song flow are unspecified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Cues reduce missed transitions in prepared sets; impact is high for click-track teams and lower for purely spontaneous ones."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Useful to bands that already work with MD cues; not every team."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 3
  reason: "README principles mention cue tracks beside click; audio media for this path is not implemented."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 4
  reason: "Same single-source principle as click: one song definition feeding sheets and sampled cues."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "Authoring, audio storage, scheduling against song structure, and player UI share the audio-blob epic and are large."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 4
  reason: "Cues that fire late or on the wrong section are worse than no cues; depends on timing infrastructure from click."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Play cue tracks from the player

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | Cue sampling is named; cue format, authoring, and sync to song flow are unspecified. |
| Impact | 3 / 5 | Cues reduce missed transitions in prepared sets; impact is high for click-track teams and lower for purely spontaneous ones. |
| Reach | 3 / 5 | Useful to bands that already work with MD cues; not every team. |
| Evidence | 3 / 5 | README principles mention cue tracks beside click; audio media for this path is not implemented. |
| Strategic fit | 4 / 5 | Same single-source principle as click: one song definition feeding sheets and sampled cues. |
| Effort | 4 / 5 | Authoring, audio storage, scheduling against song structure, and player UI share the audio-blob epic and are large. |
| Delivery risk | 4 / 5 | Cues that fire late or on the wrong section are worse than no cues; depends on timing infrastructure from click. |

## Problem

There is no way to attach and play cue audio (spoken "chorus", musical hits) from the player. Teams that use MD cues keep them in another tool that is not tied to the Worship Viewer song.

## Proposed outcome

The player can play cue tracks in time with the current song so players hear section calls and other cues without leaving the chart.

**In scope**

- Associate cue audio (or cue events) with a song.
- Play those cues in the player, routed like in-ear audio rather than AV projection.
- Basic authoring or upload for a first cue format.

**Out of scope**

- Full digital MD automation ([player-digital-music-director.md](player-digital-music-director.md)).
- Congregation-facing cue display.

## Success criteria

- A song with cues plays them at the intended moments when the player is running.
- Users without cue audio still get a normal silent player.
- Cues do not leak to the projection output by default.

## Planning notes

- **Approach:** Build on click timing ([player-sampling-click-track.md](player-sampling-click-track.md)) and audio blobs (future epic H-1); start with a single stereo cue mix before per-stem cues.
- **Dependencies:** Audio storage; song structure/flow timestamps.
- **Open questions:** Uploaded stem vs event list plus TTS? Who authors cues? Sync start across Room participants?
- **Risks and mitigations:** Drift vs click; share one transport clock and keep cues off unless click/transport is running.
