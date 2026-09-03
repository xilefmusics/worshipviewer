---
title: "Let players enlarge lyrics without app-wide zoom"
summary: "Restore a safe way to enlarge player content—lyric font scale and/or zoom on blobs—without bringing back the downsides of zooming the whole app."
area: "Player"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "improvement to an existing capability"
personas:
  - "musician"
  - "presenter"
  - "viewer"
primary_persona: "musician"
benefit: "Players can read lyrics and sheets at a comfortable size on small or distant screens without breaking hub layout or form focus."

clarity:
  score: 3
  reason: "The constraint (no whole-app zoom) and two candidate levers (lyric font factor, blob-only zoom) are stated; the exact player surfaces and defaults are not."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Readable player content is a core live-use need; this is more than a convenience if current sizing fails on phones or projectors."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 4
  reason: "Most musicians using the player on phones or tablets would hit sizing limits."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 2
  reason: "Users have asked for zoom; the app currently sets `user-scalable=no` and `touch-action: manipulation` by design."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Readable sheets and lyrics support the main job of the player without expanding into a new product area."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 3
  reason: "Player typography, blob viewers, settings, localization, and regression coverage across book/AV/sheet views land near a thousand lines."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "Zoom was disabled on purpose; pinch-zoom can break layout, double-tap, and iOS input focus if it leaks outside the player."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Let players enlarge lyrics without app-wide zoom

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 3 / 5 | The constraint (no whole-app zoom) and two candidate levers (lyric font factor, blob-only zoom) are stated; the exact player surfaces and defaults are not. |
| Impact | 3 / 5 | Readable player content is a core live-use need; this is more than a convenience if current sizing fails on phones or projectors. |
| Reach | 4 / 5 | Most musicians using the player on phones or tablets would hit sizing limits. |
| Evidence | 2 / 5 | Users have asked for zoom; the app currently sets `user-scalable=no` and `touch-action: manipulation` by design. |
| Strategic fit | 3 / 5 | Readable sheets and lyrics support the main job of the player without expanding into a new product area. |
| Effort | 3 / 5 | Player typography, blob viewers, settings, localization, and regression coverage across book/AV/sheet views land near a thousand lines. |
| Delivery risk | 3 / 5 | Zoom was disabled on purpose; pinch-zoom can break layout, double-tap, and iOS input focus if it leaks outside the player. |

## Problem

Some users want to zoom the player. The app disables viewport zoom (`user-scalable=no`) and uses `touch-action: manipulation` to avoid double-tap zoom and iOS input auto-zoom. AV content already has a font-size setting; book/sheet player sizing is layout-driven and does not offer a general zoom.

## Proposed outcome

Players can enlarge lyrics and, if needed, zoom blob content, without enabling zoom for the rest of the application.

**In scope**

- A player-local lyric/sheet font scale factor.
- Optional pinch or pan-zoom limited to blob/sheet surfaces.
- Keeping hub, forms, and the rest of the app non-zoomable.

**Out of scope**

- Turning on `user-scalable=yes` for the whole SPA.
- Changing projector output independently of the local player, unless that is later specified.

## Success criteria

- A musician can increase lyric/sheet size in the player and keep it readable.
- Hub lists, dialogs, and text inputs do not gain pinch or double-tap page zoom.
- Blob zoom, if shipped, does not steal vertical scroll from the player chrome.

## Planning notes

- **Approach:** Prefer an explicit font-size control over browser zoom; if blob zoom is added, confine it to the blob viewport.
- **Dependencies:** Current viewport meta, player book layout, and AV `contentLayer.fontSize`.
- **Open questions:** Does the scale persist per device, per song, or per session? Should Rooms sync scale or keep it local? Are PDFs/images the only blob zoom targets?
- **Risks and mitigations:** Accidental app-wide zoom on iOS; keep the viewport policy and test player, hub, and login inputs on iPhone.
