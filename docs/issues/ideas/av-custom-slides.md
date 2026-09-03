---
title: "Project custom slides in AV mode"
summary: "Let AV operators show uploaded slides (PDF, PPTX, PNG, JPEG, SVG) on the projection path, not only lyric-derived slides."
area: "AV"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "new capability or area"
personas:
  - "presenter"
  - "AV team"
  - "worship leader"
  - "viewer"
primary_persona: "presenter"
benefit: "Sermon notes, liturgy, and other non-lyric slides can live in the same AV output as songs."

clarity:
  score: 3
  reason: "Formats are listed; whether this reuses the Media slide-deck pipeline or a new AV-only path, and how setlists interleave slides with songs, still need decisions."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 4
  reason: "Custom slides remove a major reason teams keep a second presentation tool beside Worship Viewer."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Presenters and AV teams; every service that currently uses PowerPoint/PDF for non-song content."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 3
  reason: "Media already supports slide decks (PNG/JPEG/SVG/PDF, not PPTX); gaps.md says AV still uses lyric-derived slides only."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 4
  reason: "Setlists already embed Media items; wiring them to AV projection advances an existing content model."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "AV player integration, PPTX (new), projection sync, and tests are large even with the existing deck pipeline."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "PPTX fidelity, PDF page rendering, and live slide advance across outputs have meaningful uncertainty."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Project custom slides in AV mode

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 3 / 5 | Formats are listed; whether this reuses the Media slide-deck pipeline or a new AV-only path, and how setlists interleave slides with songs, still need decisions. |
| Impact | 4 / 5 | Custom slides remove a major reason teams keep a second presentation tool beside Worship Viewer. |
| Reach | 3 / 5 | Presenters and AV teams; every service that currently uses PowerPoint/PDF for non-song content. |
| Evidence | 3 / 5 | Media already supports slide decks (PNG/JPEG/SVG/PDF, not PPTX); gaps.md says AV still uses lyric-derived slides only. |
| Strategic fit | 4 / 5 | Setlists already embed Media items; wiring them to AV projection advances an existing content model. |
| Effort | 4 / 5 | AV player integration, PPTX (new), projection sync, and tests are large even with the existing deck pipeline. |
| Delivery risk | 3 / 5 | PPTX fidelity, PDF page rendering, and live slide advance across outputs have meaningful uncertainty. |

## Problem

AV projection builds slides from lyrics. Custom slide blobs are a documented gap. The Media library can already ingest slide decks (PNG, JPEG, sanitized SVG, PDF) and setlists can include Media items, but AV mode does not present those as custom slides. PPTX is not in the current deck sniff list.

## Proposed outcome

Operators can put PDF, PPTX, PNG, JPEG, or SVG slides on the AV output and advance them like a presentation, interleaved with songs as the setlist allows.

**In scope**

- Showing custom slide pages on AV projection (and Room AV).
- The listed formats, with PPTX called out as new if kept.
- Navigation that does not lose lyric songs in the same set.

**Out of scope**

- Full PowerPoint animations and embedded video as v1, unless a later epic says so.
- SongBeamer/ProPresenter file round-trip (separate external-formats epic).

## Success criteria

- A setlist Media slide deck (or equivalent) is visible on the AV output page by page.
- Unsupported or unsafe files fail with the existing media problem codes, not a hung output.
- Lyric songs in the same set still project as they do today.

## Planning notes

- **Approach:** Prefer wiring existing Media `slide_deck` content into Player AV rather than a parallel upload UI; add PPTX only if v1 requires it.
- **Dependencies:** Media deck pipeline; setlist `items` media entries; AV projection protocol (gaps M-1/M-2).
- **Open questions:** Must PPTX ship in v1 or is PDF enough? Who advances slides vs song lyrics? Speaker notes?
- **Risks and mitigations:** PPTX is a large parser; ship PDF/images first and treat PPTX as a follow-on.
