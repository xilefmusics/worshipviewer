---
title: "Play a single backing track from the player"
summary: "Let the player play one uploaded or linked audio track in time with the current song."
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
benefit: "A band can run one backing track from the same player as the chart instead of a separate audio player."

clarity:
  score: 2
  reason: "Single-track sampling is named; sync to click, start offset, and FOH vs IEM routing are unspecified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "One synced track would replace a common two-app workflow for teams that use tracks."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Substantial among teams that already use tracks; unused by fully live bands."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 2
  reason: "Media library already stores uploaded audio, but the player sampling/track transport is not built; demand is the idea plus the audio epic."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Supports prepared-but-flexible sets using the song as source, without going as far as a DAW."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "Transport, sync, media playback in the player, and tests are a large feature even for one stem."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "Sync with click/cues and output routing must be right or tracks fight the band."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Play a single backing track from the player

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | Single-track sampling is named; sync to click, start offset, and FOH vs IEM routing are unspecified. |
| Impact | 3 / 5 | One synced track would replace a common two-app workflow for teams that use tracks. |
| Reach | 3 / 5 | Substantial among teams that already use tracks; unused by fully live bands. |
| Evidence | 2 / 5 | Media library already stores uploaded audio, but the player sampling/track transport is not built; demand is the idea plus the audio epic. |
| Strategic fit | 3 / 5 | Supports prepared-but-flexible sets using the song as source, without going as far as a DAW. |
| Effort | 4 / 5 | Transport, sync, media playback in the player, and tests are a large feature even for one stem. |
| Delivery risk | 3 / 5 | Sync with click/cues and output routing must be right or tracks fight the band. |

## Problem

Teams can store audio in the Media library, but the song player does not run a single backing track locked to the chart. Playback and sheets stay in different apps.

## Proposed outcome

The player can play one track for the current song, with start/stop (and ideally shared transport with click if both exist).

**In scope**

- Attach one audio track to a song (upload or existing Media).
- Play it from the player with a simple transport.
- Define where it is heard (IEMs, FOH, or local only).

**Out of scope**

- Mixer with multiple stems ([player-sampling-multi-track.md](player-sampling-multi-track.md)).
- Ableton-style session view.

## Success criteria

- Starting the player track plays the attached file from the intended start point.
- Stopping leaves the song chart usable without leftover audio.
- A song without a track behaves as it does today.

## Planning notes

- **Approach:** Link song → one Media audio (or blob) and drive HTMLAudio/Web Audio from the player transport; share clock with click when present.
- **Dependencies:** Media audio content type; future blob audio if tracks are song-owned files.
- **Open questions:** Song-owned file vs setlist Media item? Must click be present? Gapless setlist advances?
- **Risks and mitigations:** Double playback from AV media and player track; one transport owner per song.
