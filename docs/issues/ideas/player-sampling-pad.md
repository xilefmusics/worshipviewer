---
title: "Play pads from the player"
summary: "Let the player start atmospheric pad audio for a song so keys/atmosphere can follow the same source as the chart."
area: "Player"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "new capability or area"
personas:
  - "musician"
  - "AV team"
  - "worship leader"
primary_persona: "musician"
benefit: "A pad can run under a song or moment without a separate backing-track player."

clarity:
  score: 2
  reason: "Pad sampling is named; looping, key-follow, wet/dry routing, and whether pads are song-scoped or ambient are unspecified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Pads are a common worship-atmosphere tool; integrating them would change how some teams start songs."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 2
  reason: "Used by teams that want pads; many services never use them."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 2
  reason: "Audio blobs/pads are listed as a future epic; no separate user demand record beyond this idea."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Fits sampled audio from the song source, but is less central than click."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "Looping audio, key changes, mixer routing, and storage share the audio-blob epic and are large."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "Endless loops, key mismatch after transpose, and sending pads to the house mix need product rules."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Play pads from the player

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | Pad sampling is named; looping, key-follow, wet/dry routing, and whether pads are song-scoped or ambient are unspecified. |
| Impact | 3 / 5 | Pads are a common worship-atmosphere tool; integrating them would change how some teams start songs. |
| Reach | 2 / 5 | Used by teams that want pads; many services never use them. |
| Evidence | 2 / 5 | Audio blobs/pads are listed as a future epic; no separate user demand record beyond this idea. |
| Strategic fit | 3 / 5 | Fits sampled audio from the song source, but is less central than click. |
| Effort | 4 / 5 | Looping audio, key changes, mixer routing, and storage share the audio-blob epic and are large. |
| Delivery risk | 3 / 5 | Endless loops, key mismatch after transpose, and sending pads to the house mix need product rules. |

## Problem

The player cannot start pad/atmosphere audio attached to a song. Teams that use pads run a second device or DAW that is not tied to Worship Viewer transposition or setlist position.

## Proposed outcome

The player can play a pad associated with the current song (or moment), with clear start/stop, without replacing a full backing-track rig.

**In scope**

- Attach pad audio to a song (or team pad library).
- Play/stop from the player with loop behavior defined.
- Keep pad audio off lyric projection.

**Out of scope**

- Full multi-track session ([player-sampling-multi-track.md](player-sampling-multi-track.md)).
- Physical synth control.

## Success criteria

- A user can start and stop a pad from the player for a song that has pad audio.
- Transpose policy for pitched pads is explicit (follow key or stay as recorded).
- House/AV video is unchanged unless an operator routes pad to FOH on purpose.

## Planning notes

- **Approach:** Reuse audio blob + media playback once H-1 exists; start with one looping file per song.
- **Dependencies:** Audio blobs; song key/transpose.
- **Open questions:** Follow transposition? Crossfade between songs? Who hears the pad (IEMs vs FOH)?
- **Risks and mitigations:** Pad in the wrong key after a room transpose; either pitch-shift (hard) or label pads as concert-key only in v1.
