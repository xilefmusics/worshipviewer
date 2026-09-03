---
title: "Assign custom AV backgrounds per song"
summary: "Let teams assign an uploaded or library background to a song so AV projection can apply it automatically instead of relying only on session presets."
area: "AV"
status: "rough"
owner: null
last_reviewed: "2026-08-31"

primary_impact: "user"
change_type: "new capability or area"
personas:
  - "AV team"
  - "presenter"
  - "viewer"
primary_persona: "AV team"
benefit: "Each song can carry an intentional projection look that appears automatically whenever the song is presented."

clarity:
  score: 3
  reason: "The per-song behavior is defined; asset types, fallback precedence, Room sync, and the relationship to Media versus blobs still need decisions."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Song-specific visuals meaningfully improve projection and remove repeated live background selection."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "AV operators and anyone watching projection; not every musician on chords view."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 3
  reason: "docs/future-epics/gaps.md records that AV uses preset backgrounds only and that uploaded backgrounds need blob/media plus projection payload work."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Strengthens AV as a first-class output of the same song source."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "Song persistence, asset selection, uploads, permissions, projection payloads, Room sync, migrations, and tests make this a multi-thousand-line change."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "Large images, licensing, and multi-instance projection sync can fail in live services."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Assign custom AV backgrounds per song

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 3 / 5 | The per-song behavior is defined; asset types, fallback precedence, Room sync, and the relationship to Media versus blobs still need decisions. |
| Impact | 3 / 5 | Song-specific visuals meaningfully improve projection and remove repeated live background selection. |
| Reach | 3 / 5 | AV operators and anyone watching projection; not every musician on chords view. |
| Evidence | 3 / 5 | docs/future-epics/gaps.md records that AV uses preset backgrounds only and that uploaded backgrounds need blob/media plus projection payload work. |
| Strategic fit | 3 / 5 | Strengthens AV as a first-class output of the same song source. |
| Effort | 4 / 5 | Song persistence, asset selection, uploads, permissions, projection payloads, Room sync, migrations, and tests make this a multi-thousand-line change. |
| Delivery risk | 3 / 5 | Large images, licensing, and multi-instance projection sync can fail in live services. |

## Problem

AV mode uses preset backgrounds only. Teams cannot associate a visual with a song, so an operator must accept a generic look, change the background manually each time, or overlay another tool.

## Proposed outcome

A team can assign a custom background to a song. Opening that song in AV mode applies the assignment to local and Room outputs, while the operator can still override it for the live session.

**In scope**

- Choose a custom still background from team-owned assets and save the assignment on the song.
- Apply the song background when the song becomes active in AV mode.
- Include the selected background in the AV projection payload and Room projection state.
- Keep presets and an operator session override as fallbacks.

**Out of scope**

- Motion/generative backgrounds ([av-dynamic-backgrounds.md](av-dynamic-backgrounds.md)).
- Full ProPresenter-style look packages.

## Success criteria

- A user with song-edit permission can assign, change, or clear a background on a song.
- Activating the song updates the projection window and room AV clients without restarting the player.
- An unavailable assignment falls back predictably without erasing the song's saved choice.
- Missing or unauthorized assets fail closed to a preset, not a blank or leaked blob.
- Lyric readability still has contrast controls (existing content layer).

## Planning notes

- **Approach:** Store a background asset reference with song data, extend `backgroundLayer` beyond `{ preset }`, and resolve song assignment versus live override when producing projection state; follow gaps epic M-1/M-2.
- **Dependencies:** Song API/schema and migration; blob image types; AV projection protocol; Room snapshot fields.
- **Open questions:** Does the live override persist until cleared or reset at the next song? Which roles may assign assets? Are still images the only supported asset type?
- **Risks and mitigations:** Huge assets on slow church Wi-Fi; limit dimensions, cache, and prefetch.
