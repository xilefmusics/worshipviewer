---
title: "Song editor key-change modes save the same chord result"
summary: "When a worship leader changes a song's key, Transpose chords and Keep chord symbols can persist the same transposed chord result instead of preserving their distinct behaviors."
area: "Song Editor"
status: "fixed"
owner: null
last_reviewed: "2026-08-31"

personas:
  - "worship leader"
  - "musician"
primary_persona: "worship leader"
environment:
  version: null
  deployment: null
  client: null

severity:
  score: 3
  reason: "The editor cannot reliably preserve the user's intended chord behavior during a key change, impairing song preparation and risking musically incorrect saved chord sheets."
  scale:
    1: "Cosmetic or negligible"
    2: "Minor inconvenience with an easy workaround"
    3: "Important workflow is impaired"
    4: "Core workflow is blocked or data may be corrupted"
    5: "Security, data loss, or widespread outage"
frequency:
  score: 4
  reason: "Repository state flow suggests the modes converge on most key changes made after a song is loaded in the normal editor path, but this has not been measured in a running build."
  scale:
    1: "Seen once or in a rare edge case"
    2: "Occasional"
    3: "Regular under specific conditions"
    4: "Most attempts"
    5: "Every attempt or continuously"
reproducibility:
  score: 5
  reason: "The stale canonical snapshot was reproduced deterministically at the editor autosave boundary for both key-change choices and is now covered by component regression tests."
  scale:
    1: "Not reproduced"
    2: "Intermittent with unknown trigger"
    3: "Reproduced with incomplete conditions"
    4: "Reliable steps known"
    5: "Minimal deterministic reproduction"
evidence:
  score: 5
  reason: "Component tests now drive both dialog choices and verify distinct root and slash-bass chord levels in the autosave payload, in addition to the existing transformation tests."
  scale:
    1: "Unverified report"
    2: "Single observation"
    3: "Repeated observations or useful diagnostics"
    4: "Confirmed with logs, tests, or repository evidence"
    5: "Failing automated regression test"
effort:
  score: 2
  reason: "Synchronizing the canonical editor snapshot during key changes and adding component-level save and reload regression coverage should be localized to roughly 100 lines."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
fix_risk:
  score: 2
  reason: "The state synchronization change is localized, but it must preserve compose edits and avoid lossy ChordPro round-trips across both editor tabs and chord display formats."
  scale:
    1: "Isolated and reversible"
    2: "Small, well-understood surface"
    3: "Meaningful regression surface"
    4: "Cross-cutting behavior or migration risk"
    5: "Fundamental uncertainty or high blast radius"
---

[← Back to issues README](../Readme.md)

# Bug: Song editor key-change modes save the same chord result

## Assessment

Scores are from 1 to 5. Higher means more severe, frequent, reproducible,
well-evidenced, costly, or risky, depending on the category.

| Category | Score | Reason |
|---|:---:|---|
| Severity | 3 / 5 | The editor cannot reliably preserve the user's intended chord behavior during a key change, impairing song preparation and risking musically incorrect saved chord sheets. |
| Frequency | 4 / 5 | Repository state flow suggests the modes converge on most key changes made after a song is loaded in the normal editor path, but this has not been measured in a running build. |
| Reproducibility | 5 / 5 | The stale canonical snapshot was reproduced deterministically at the editor autosave boundary for both key-change choices and is now covered by component regression tests. |
| Evidence | 5 / 5 | Component tests now drive both dialog choices and verify distinct root and slash-bass chord levels in the autosave payload, in addition to the existing transformation tests. |
| Effort | 2 / 5 | Synchronizing the canonical editor snapshot during key changes and adding component-level save and reload regression coverage should be localized to roughly 100 lines. |
| Fix risk | 2 / 5 | The state synchronization change is localized, but it must preserve compose edits and avoid lossy ChordPro round-trips across both editor tabs and chord display formats. |

## Observed behavior

After changing a song from one set key to another, choosing **Transpose chords**
or **Keep chord symbols** produces the same saved chord result. The distinction
presented by the confirmation dialog is therefore lost, and the user cannot rely
on the chosen mode to control the saved chord symbols.

## Expected behavior

- **Transpose chords** should change the displayed chord symbols with the song
  key while retaining their key-relative stored levels (for example, scale
  degree 1 remains scale degree 1).
- **Keep chord symbols** should retain the displayed absolute chord symbols and
  remap their stored levels relative to the new song key (for example, a chord
  displayed as C remains C).

The selected behavior should survive autosave, reopening the song, switching
editor tabs, and changing chord display format.

## Reproduction

**Prerequisites**

- An editable song with a set key and at least one chord.
- The exact affected version, deployment, client, editor tab, and chord display
  format are unknown.

**Steps**

1. Record the song's current key and chord symbols.
2. Change the song key to another set key.
3. Choose **Transpose chords**, allow the editor to save, and reopen the song to
   record the persisted result.
4. Restore the original song data, repeat the key change, and choose **Keep chord
   symbols**.
5. Allow the editor to save, reopen the song, and compare the persisted result.

**Actual result**

- Both choices save the same chord result according to the report.

**Expected result**

- **Transpose chords** changes the chord symbols with the key, while **Keep chord
  symbols** preserves their absolute symbols.

These comparison steps are derived from the reported behavior and repository
flow; they have not yet been executed against a running build.

## Evidence

- User report: "Both transpose modes do work the same."
- `frontend/app/src/lib/song-editor-state.ts` deliberately implements different
  behaviors: only `keep` calls `remapSongChordLevelsForAbsolutePitch` before
  formatting the new source.
- `frontend/app/src/lib/song-editor-state.test.ts` verifies the distinction at
  helper level: `transpose` retains the stored chord level, while `keep` remaps
  it.
- `frontend/app/src/components/songs/SongEditorScreen.tsx` initializes
  `composeSongDataRef` from the loaded song and prefers that ref over the newly
  parsed source when constructing both the memoized and immediate autosave
  payloads.
- The same component's `commitKeyChange` updates `sourceText` and metadata after
  applying a mode, but does not update or clear `composeSongDataRef`. The
  persisted draft can therefore be reconstructed from the pre-change chord
  levels plus the new key, discarding the `keep` remap.
- Component regression tests now exercise both dialog choices at the autosave
  boundary and verify distinct root and slash-bass levels.

## Workaround

- Before the fix, manually editing the chord symbols in the Advanced tab could
  replace the stale compose snapshot, but this was not a reliable workflow.

## Resolution notes

- **Root cause:** `commitKeyChange` changed the formatted source but left
  `composeSongDataRef` pointing at the pre-change canonical song data. Autosave
  deliberately prefers that ref over reparsed source data, so it rebuilt the
  payload with the old chord levels and discarded the **Keep chord symbols**
  remap.
- **Fix:** The key-change transformation now returns canonical song data.
  `SongEditorScreen` installs that result in the compose snapshot, rebuilds the
  compose sections, advances the draft revision, and formats the source from the
  same snapshot. The editor therefore has one canonical result without a lossy
  format/parse round trip.
- **Regression coverage:** Component tests drive a C-to-D change through both
  dialog choices and inspect the autosave draft. They verify distinct stored
  levels for both a chord root and slash bass; helper tests retain direct
  coverage of the transformation and patch construction.

## Verification

- Focused song-editor tests pass for both key-change modes.
- Frontend ESLint, TypeScript typechecking, all 819 tests, and the production
  build pass.
