---
title: "Edit songs as SongBeamer source"
summary: "Let worship leaders edit a song in SongBeamer syntax inside the advanced song editor instead of using SongBeamer only for file import and export."
area: "Song Editor"
status: "rough"
owner: null
last_reviewed: "2026-08-31"

primary_impact: "user"
change_type: "improvement to an existing capability"
personas:
  - "worship leader"
  - "operator"
primary_persona: "worship leader"
benefit: "Teams familiar with SongBeamer can edit source in their existing notation without manually translating it to ChordPro."

clarity:
  score: 3
  reason: "The desired source-format choice is understood, but format switching, unsupported SongBeamer fields, encoding, and preservation rules remain open."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Native SongBeamer editing would remove a format-conversion step for teams that maintain SongBeamer song libraries."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 2
  reason: "The benefit is concentrated among worship leaders and operators who already use SongBeamer source files."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 2
  reason: "The inbox request is a direct signal, and existing SongBeamer import/export support demonstrates format relevance, but usage and editing demand are not measured."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Supporting established worship-song formats advances interoperability around the core song workflow."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 3
  reason: "Parsing and formatting already exist, but editor format state, byte encoding, syntax support, switching behavior, autosave integration, tests, and documentation likely require roughly a thousand lines."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "Round-tripping through canonical song data may discard SongBeamer directives or formatting that Worship Viewer does not model."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Edit songs as SongBeamer source

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 3 / 5 | The desired source-format choice is understood, but format switching, unsupported SongBeamer fields, encoding, and preservation rules remain open. |
| Impact | 3 / 5 | Native SongBeamer editing would remove a format-conversion step for teams that maintain SongBeamer song libraries. |
| Reach | 2 / 5 | The benefit is concentrated among worship leaders and operators who already use SongBeamer source files. |
| Evidence | 2 / 5 | The inbox request is a direct signal, and existing SongBeamer import/export support demonstrates format relevance, but usage and editing demand are not measured. |
| Strategic fit | 3 / 5 | Supporting established worship-song formats advances interoperability around the core song workflow. |
| Effort | 3 / 5 | Parsing and formatting already exist, but editor format state, byte encoding, syntax support, switching behavior, autosave integration, tests, and documentation likely require roughly a thousand lines. |
| Delivery risk | 3 / 5 | Round-tripping through canonical song data may discard SongBeamer directives or formatting that Worship Viewer does not model. |

## Problem

Worship Viewer can import and export SongBeamer `.sng` files, but the advanced song editor always presents and parses ChordPro source. A team that works in SongBeamer syntax must edit elsewhere or translate its changes before saving them in Worship Viewer.

## Proposed outcome

The advanced song editor offers SongBeamer as a source format. A user can edit, validate, and save SongBeamer source while Worship Viewer continues to persist its canonical structured song data.

**In scope**

- Choose SongBeamer as the advanced editor's source format.
- Parse edits through the existing SongBeamer engine and show actionable validation errors.
- Format canonical song data back to editable SongBeamer source.
- Define safe behavior when switching between ChordPro and SongBeamer.

**Out of scope**

- Replacing canonical structured song storage with raw `.sng` files.
- Guaranteeing lossless preservation of unsupported SongBeamer directives before preservation requirements are defined.
- Adding other source-editor formats as part of this idea.

## Success criteria

- A user can select SongBeamer source, edit a supported song, and save it without importing or exporting a file.
- Reloading the song preserves every field represented by Worship Viewer's canonical song model.
- Invalid SongBeamer input blocks autosave and produces a useful error without damaging the last valid song.
- Switching formats warns or blocks when the conversion would lose unsupported information.

## Planning notes

- **Approach:** Generalize the advanced editor's ChordPro-only parse/format path behind a selected source format, reusing `parseSongBeamer` and `formatSongBeamer` from the chord engine.
- **Dependencies:** A browser-safe text/byte encoding policy; SongBeamer syntax highlighting or a documented plain-text fallback; autosave and draft recovery support for the selected format.
- **Open questions:** Is the format a per-song preference or a temporary editor view? Must comments, ordering, and unknown directives round-trip exactly? Which SongBeamer encodings must be editable? Should switching formats require an explicit lossy-conversion confirmation?
- **Risks and mitigations:** Silent loss of unsupported directives is the main risk; compare parsed capabilities before conversion, warn before loss, and keep the last valid draft recoverable.
