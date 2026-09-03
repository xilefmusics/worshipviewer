---
title: "Add AI assistance to the song editor"
summary: "Help authors draft, clean, or complete songs in the editor with AI, while keeping the stored song as the source of truth."
area: "Song Editor"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "new capability or area"
personas:
  - "worship leader"
  - "content maintainer"
  - "musician"
primary_persona: "worship leader"
benefit: "Creating and fixing ChordPro (structure, chords, translations) takes less manual grind."

clarity:
  score: 2
  reason: "AI integration is named; which tasks, which model, privacy, and how suggestions are applied are unspecified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Faster, higher-quality charts would be a meaningful authoring improvement if suggestions are trustworthy."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Song authors and librarians, a substantial subset of operators, not every player-only user."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 1
  reason: "No AI editor path exists; demand is the submitted idea."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Better songs in the library supports the single-source principle; AI is a means, not the product."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "Provider integration, prompt/UX, ChordPro validation, billing/privacy, and tests are a large new subsystem."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 4
  reason: "Copyrighted lyrics, hallucinated chords, cost, and sending library content to a third party are major risks."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Add AI assistance to the song editor

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | AI integration is named; which tasks, which model, privacy, and how suggestions are applied are unspecified. |
| Impact | 3 / 5 | Faster, higher-quality charts would be a meaningful authoring improvement if suggestions are trustworthy. |
| Reach | 3 / 5 | Song authors and librarians, a substantial subset of operators, not every player-only user. |
| Evidence | 1 / 5 | No AI editor path exists; demand is the submitted idea. |
| Strategic fit | 3 / 5 | Better songs in the library supports the single-source principle; AI is a means, not the product. |
| Effort | 4 / 5 | Provider integration, prompt/UX, ChordPro validation, billing/privacy, and tests are a large new subsystem. |
| Delivery risk | 4 / 5 | Copyrighted lyrics, hallucinated chords, cost, and sending library content to a third party are major risks. |

## Problem

Song authoring is manual: structure, chords, languages, and cleanup. There is no in-editor assistant to propose ChordPro or fix common issues.

## Proposed outcome

The song editor can request AI suggestions for bounded tasks (for example structure, chord guesses, or translation scaffolding) that the author reviews before save.

**In scope**

- One or a few explicit editor actions that call an assistant.
- Preview/diff and discard; never silent overwrite.
- A documented data-handling policy for song text sent to a model.

**Out of scope**

- Fully autonomous library rewriting.
- Training a custom model from customer catalogs, unless chosen later.

## Success criteria

- An author can invoke assistance and accept or reject the result.
- Invalid ChordPro cannot be saved without the same validation as a human edit.
- Users know whether content leaves the instance.

## Planning notes

- **Approach:** Start with a single task (for example "normalize section labels") behind a feature flag; keep chordlib as the validator.
- **Dependencies:** Song editor; hosting/API keys; legal/copyright stance.
- **Open questions:** Which jobs first? Cloud vs self-hosted model? Opt-in per team? Cost attribution?
- **Risks and mitigations:** Copyright and privacy; opt-in, minimize payload, log that assistance was used, and never auto-commit.
