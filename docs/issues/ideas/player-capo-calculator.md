---
title: "Show capo-friendly chords in the player"
summary: "Help guitarists play in a written key by calculating capo position and showing the chord shapes they should fret."
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
benefit: "Guitarists can pick a capo and read shapes that match their fretboard without transposing the whole room by hand."

clarity:
  score: 2
  reason: "A capo calculator is the headline; input (desired shapes vs concert key), persistence, and Room sync are unspecified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Capo is a common live guitar workflow; getting it wrong is a real rehearsal and service friction."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Primarily guitarists and some ukulele players, not every musician or AV operator."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 1
  reason: "No in-repo capo feature or recorded user requests beyond this idea."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Fits the player as the place musicians read chords, alongside existing transposition."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 3
  reason: "Capo UI, chord rendering, per-item state, tests, and i18n are around a thousand lines on top of existing transpose."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 2
  reason: "Local display-only capo is limited risk; syncing it as room transposition could surprise other instruments."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Show capo-friendly chords in the player

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | A capo calculator is the headline; input (desired shapes vs concert key), persistence, and Room sync are unspecified. |
| Impact | 3 / 5 | Capo is a common live guitar workflow; getting it wrong is a real rehearsal and service friction. |
| Reach | 3 / 5 | Primarily guitarists and some ukulele players, not every musician or AV operator. |
| Evidence | 1 / 5 | No in-repo capo feature or recorded user requests beyond this idea. |
| Strategic fit | 3 / 5 | Fits the player as the place musicians read chords, alongside existing transposition. |
| Effort | 3 / 5 | Capo UI, chord rendering, per-item state, tests, and i18n are around a thousand lines on top of existing transpose. |
| Delivery risk | 2 / 5 | Local display-only capo is limited risk; syncing it as room transposition could surprise other instruments. |

## Problem

The player can transpose the concert key for a song or Room. It does not help a guitarist choose a capo fret and read the open-chord shapes they will actually play.

## Proposed outcome

A musician can set a capo (or a preferred shape key) and see chord symbols that match what they fret, while the sounding key remains clear.

**In scope**

- Capo fret (or equivalent) control in the player chord view.
- Chord symbols rewritten for that capo.
- Local-only vs shared-room behavior documented.

**Out of scope**

- Automatic suggested capo from vocal range (that belongs with range planning).
- Non-guitar tunings unless specified later.

## Success criteria

- Setting capo 2 on a song in G shows the shapes the guitarist plays (for example E shapes) without changing other participants' concert key unless that is explicitly designed.
- Capo 0 matches today's chord display.
- The sounding key remains visible so the rest of the band is not confused.

## Planning notes

- **Approach:** Treat capo as a local view transform on top of `resolveTransposeKey` / display key, unless Product later wants it in room musical state.
- **Dependencies:** Existing player transposition UI and chordlib rendering.
- **Open questions:** Capo fret input vs "play as if in C"? Nashville numbers? Persist per user or per song? Rooms?
- **Risks and mitigations:** Mixing capo view with room transposition; label sounding key vs guitar key in the chrome.
