---
title: "Publish proper GitHub Releases again"
summary: "Restore GitHub Releases as the official way to announce versions, with notes and any artifacts operators expect, instead of relying only on git tags and Docker Hub."
area: "Infra"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "maintainer"
change_type: "improvement to an existing capability"
personas:
  - "maintainer"
  - "operator"
primary_persona: "maintainer"
benefit: "Each version has a GitHub Release people can find, with notes and a stable place to attach install artifacts."

clarity:
  score: 2
  reason: "The goal is to use GitHub Releases again; which artifacts, changelog source, and whether tags already exist without Release objects are unspecified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 2
  reason: "Improves how versions are announced and consumed, not a runtime user workflow."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 2
  reason: "Maintainers and self-hosters who look for downloads or release notes."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 2
  reason: "CI publishes Docker images on tags but there is no in-repo GitHub Release workflow; 'again' implies a prior practice that is not documented here."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "A clear release channel supports operators and matches normal open-source distribution."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 2
  reason: "A tag-triggered release job, notes, and docs are around a hundred lines unless CLI binaries and signing are included."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 2
  reason: "Wrong artifacts or duplicate tag/release jobs can confuse consumers; the blast radius stays in CI/docs."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Publish proper GitHub Releases again

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | The goal is to use GitHub Releases again; which artifacts, changelog source, and whether tags already exist without Release objects are unspecified. |
| Impact | 2 / 5 | Improves how versions are announced and consumed, not a runtime user workflow. |
| Reach | 2 / 5 | Maintainers and self-hosters who look for downloads or release notes. |
| Evidence | 2 / 5 | CI publishes Docker images on tags but there is no in-repo GitHub Release workflow; 'again' implies a prior practice that is not documented here. |
| Strategic fit | 3 / 5 | A clear release channel supports operators and matches normal open-source distribution. |
| Effort | 2 / 5 | A tag-triggered release job, notes, and docs are around a hundred lines unless CLI binaries and signing are included. |
| Delivery risk | 2 / 5 | Wrong artifacts or duplicate tag/release jobs can confuse consumers; the blast radius stays in CI/docs. |

## Problem

Version tags trigger a Docker Hub image publish, but there is no in-repo workflow that creates a GitHub Release with notes and artifacts. People looking at GitHub for a downloadable release do not get a first-class release object.

## Proposed outcome

Each shipped version has a GitHub Release with notes and the artifacts this project intends to distribute (image pointers, checksums, and/or binaries).

**In scope**

- Creating a GitHub Release when a version tag is pushed.
- Release notes (generated or maintained).
- Attaching the agreed artifacts.

**Out of scope**

- Changing the product versioning scheme, unless required to make tags match Releases.
- App-store or PWA store publishing.

## Success criteria

- Pushing a version tag creates a GitHub Release visitors can open.
- The release lists what changed and how to run that version.
- Duplicate or failed release jobs do not leave a misleading draft as the only record.

## Planning notes

- **Approach:** Add a tag-triggered Actions job (`softprops/action-gh-release` or equivalent) coordinated with the existing Docker publish job.
- **Dependencies:** Tag naming conventions; optional GHCR image URLs to link from notes.
- **Open questions:** Notes from CHANGELOG vs generated from commits? Attach CLI binaries, only links to images, or source archives? Draft vs published on tag?
- **Risks and mitigations:** Tag-without-release or release-without-image; run image publish and GitHub Release in one workflow with explicit needs.
