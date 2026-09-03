---
title: "Take notes in the player"
summary: "Let musicians capture performance notes while they play, attached to the song or set they are in."
area: "Player"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "new capability or area"
personas:
  - "musician"
  - "worship leader"
  - "presenter"
primary_persona: "musician"
benefit: "Live reminders (cues, feel, who sings) stay next to the music instead of in a separate app or paper."

clarity:
  score: 2
  reason: "An initial notetaking implementation is requested; storage, sharing, rich vs plain text, and song vs setlist scope are unknown."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "In-player notes would change how teams remember arrangement decisions during rehearsal and service."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 4
  reason: "Most musicians who use the player could attach notes to songs they play often."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 1
  reason: "No existing note model or user research is recorded in the repo."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Supports being prepared in the player without leaving the sheet, which aligns with the product's live-use goal."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "New resource or song field, sync, offline, permissions, player UI, and tests are a multi-thousand-line first version."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "Personal vs team notes, Room snapshots, and offline conflict are easy to get wrong."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Take notes in the player

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | An initial notetaking implementation is requested; storage, sharing, rich vs plain text, and song vs setlist scope are unknown. |
| Impact | 3 / 5 | In-player notes would change how teams remember arrangement decisions during rehearsal and service. |
| Reach | 4 / 5 | Most musicians who use the player could attach notes to songs they play often. |
| Evidence | 1 / 5 | No existing note model or user research is recorded in the repo. |
| Strategic fit | 3 / 5 | Supports being prepared in the player without leaving the sheet, which aligns with the product's live-use goal. |
| Effort | 4 / 5 | New resource or song field, sync, offline, permissions, player UI, and tests are a multi-thousand-line first version. |
| Delivery risk | 3 / 5 | Personal vs team notes, Room snapshots, and offline conflict are easy to get wrong. |

## Problem

The player shows songs and setlists but has no place to jot performance notes. Musicians keep cues elsewhere, so they are easy to miss mid-song.

## Proposed outcome

An initial notetaking experience in the player lets a user write and reread notes in context while playing.

**In scope**

- Create, edit, and view notes from the player.
- A defined attachment target (song, setlist item, or user-personal overlay).
- Enough persistence that notes survive a reload.

**Out of scope**

- Full collaborative rich-text documents.
- PDF annotation or handwriting, unless chosen as the v1 medium.

## Success criteria

- A musician can save a note during a player session and see it the next time they open that song (or item).
- Notes do not block playback chrome on small screens.
- Permissions match the chosen personal vs team model.

## Planning notes

- **Approach:** Start with personal, plain-text notes keyed by song id (simplest ACL) unless team-shared notes are required for v1.
- **Dependencies:** Song/setlist identity; offline cache if notes must work offline.
- **Open questions:** Personal or team-shared? Per language/arrangement? Visible in Rooms? Editor as well as player?
- **Risks and mitigations:** Leaking personal notes into room snapshots; keep notes off the content snapshot unless sharing is explicit.
