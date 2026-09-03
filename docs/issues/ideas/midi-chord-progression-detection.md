---
title: "Detect chords and progressions from MIDI"
summary: "Let the player (or related input) hear MIDI and surface chord and progression detection to speed capturing or following live harmony."
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
benefit: "A keyboard or MIDI source can fill or follow chords without typing every change by hand."

clarity:
  score: 2
  reason: "MIDI chord and progression detection is named; live follow vs editor capture, Web MIDI vs file import, and output (ChordPro vs overlay) are unspecified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Would speed song capture and could support live following; not required for teams that already have charts."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 2
  reason: "Only musicians with MIDI hardware or files, a minority of users."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 1
  reason: "No MIDI stack exists in the repo; need is the submitted idea."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 2
  reason: "Loosely aligned with song capture and player intelligence; not a stated core principle."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "Web MIDI permissions, detection algorithm, UI, and tests are a large new area even if chordlib helps on the theory side."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 4
  reason: "Browser MIDI support, latency, and mis-detected chords during a live set are high-severity UX failures."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Detect chords and progressions from MIDI

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | MIDI chord and progression detection is named; live follow vs editor capture, Web MIDI vs file import, and output (ChordPro vs overlay) are unspecified. |
| Impact | 3 / 5 | Would speed song capture and could support live following; not required for teams that already have charts. |
| Reach | 2 / 5 | Only musicians with MIDI hardware or files, a minority of users. |
| Evidence | 1 / 5 | No MIDI stack exists in the repo; need is the submitted idea. |
| Strategic fit | 2 / 5 | Loosely aligned with song capture and player intelligence; not a stated core principle. |
| Effort | 4 / 5 | Web MIDI permissions, detection algorithm, UI, and tests are a large new area even if chordlib helps on the theory side. |
| Delivery risk | 4 / 5 | Browser MIDI support, latency, and mis-detected chords during a live set are high-severity UX failures. |

## Problem

Songs are entered as ChordPro (and related formats). There is no MIDI input path to detect chords or progressions from a keyboard or MIDI file.

## Proposed outcome

MIDI input can be analyzed into chords and progressions that a musician can accept into a song or follow in the player.

**In scope**

- MIDI source (browser Web MIDI and/or `.mid` import).
- Chord and progression detection with a review step.
- A defined destination (song editor draft and/or player overlay).

**Out of scope**

- Full notation engraving.
- Audio-to-chord (mic) detection, unless bundled later.

## Success criteria

- A simple major/minor progression played on MIDI yields recognizable chord labels a user can save or discard.
- Unsupported browsers show that MIDI is unavailable.
- Detection never silently overwrites a saved song.

## Planning notes

- **Approach:** Prefer editor capture (offline, reviewable) before live player follow; reuse chordlib where it already understands chord symbols.
- **Dependencies:** Song editor; chordlib WASM; secure-context Web MIDI.
- **Open questions:** Live follow or capture-only? Channel/program filters? How are inversions and slash chords shown?
- **Risks and mitigations:** Wrong chords in a service; keep an accept/reject UI and default to editor-only for v1.
