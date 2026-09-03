---
title: "Play a click track from the player"
summary: "Let the player start a synchronized click so the band can lock tempo from the same song source as the sheet."
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
benefit: "Drummers and in-ear users can hear a click derived from the song they are already playing, instead of a separate metronome."

clarity:
  score: 2
  reason: "Click sampling is named; generated vs uploaded audio, count-in, time-signature changes, and routing to in-ears are unspecified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 4
  reason: "A reliable click is a major live-band pain when tempo lives only on paper or in another app."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Most useful to bands that play to a click; many smaller teams will not use it."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 3
  reason: "The product principles already name sampling click tracks; audio blobs are a documented future epic, not implemented."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 4
  reason: "Single source of truth for sheets and click is an explicit core principle."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "Audio MIME/storage, player scheduling, tempo mapping, and tests sit on the audio-blob epic and are multi-thousand-line work."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 4
  reason: "Browser audio latency, background tabs, and Room sync can make a click unusable if timing is wrong."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Play a click track from the player

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | Click sampling is named; generated vs uploaded audio, count-in, time-signature changes, and routing to in-ears are unspecified. |
| Impact | 4 / 5 | A reliable click is a major live-band pain when tempo lives only on paper or in another app. |
| Reach | 3 / 5 | Most useful to bands that play to a click; many smaller teams will not use it. |
| Evidence | 3 / 5 | The product principles already name sampling click tracks; audio blobs are a documented future epic, not implemented. |
| Strategic fit | 4 / 5 | Single source of truth for sheets and click is an explicit core principle. |
| Effort | 4 / 5 | Audio MIME/storage, player scheduling, tempo mapping, and tests sit on the audio-blob epic and are multi-thousand-line work. |
| Delivery risk | 4 / 5 | Browser audio latency, background tabs, and Room sync can make a click unusable if timing is wrong. |

## Problem

Songs carry tempo metadata for display, but the player cannot sample a click. Teams use a separate metronome, which drifts from the sheet and from each other. Blobs today accept images only; audio delivery is a known gap.

## Proposed outcome

The player can run a click aligned to the current song's tempo (and later, section changes) from the same source as the chart.

**In scope**

- Start/stop click in the player for a song with a known tempo.
- Audio output suitable for headphones or a drummer feed.
- Storage/validation path for click audio if clicks are uploaded rather than synthesized.

**Out of scope**

- Full multi-track stems ([player-sampling-multi-track.md](player-sampling-multi-track.md)).
- Hardware MIDI clock, unless required later.

## Success criteria

- A musician can hear a steady click at the song tempo from the player.
- Click does not play through the congregation-facing AV output unless that is explicitly enabled.
- Missing tempo is handled with a clear empty state, not a silent wrong click.

## Planning notes

- **Approach:** Decide synthesized metronome vs uploaded click file; both need Web Audio and likely audio blob support (future epic H-1).
- **Dependencies:** Audio blob MIME, quota, and player delivery; song tempo fields.
- **Open questions:** Synth vs file? Count-in bars? Tempo maps / ritard? Shared start in Rooms?
- **Risks and mitigations:** Latency and autoplay policies; use user-gesture start, measure drift, keep click off projection by default.
