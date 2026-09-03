---
title: "Link related songs to each other"
summary: "Let teams connect songs (arrangements, translations, medleys) with a dedicated song-to-song relationship, without colliding with setlist SongLink embeds."
area: "General"
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
benefit: "Related charts are findable from each other instead of living as unmarked duplicates."

clarity:
  score: 2
  reason: "SongLinks as a product name is ambiguous; the repo already uses `shared::song::Link` for setlist/collection embeds, and a dedicated model is only sketched in gaps."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "Connecting arrangements and translations would improve library navigation for teams with many related charts."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Teams with multi-language or multi-arrangement catalogs; less valuable for tiny libraries."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 3
  reason: "Future epic H-3 documents the naming collision and the need for a real song-to-song link model."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Supports one conceptual song with multiple presentations, which fits the single-source idea."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 4
  reason: "New relationship model, APIs, hub/editor UI, migrations, and careful naming away from `SongLink` are a large change."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "Schema naming collisions and bidirectional vs typed links (translation, arrangement) need a migration plan."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Link related songs to each other

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | SongLinks as a product name is ambiguous; the repo already uses `shared::song::Link` for setlist/collection embeds, and a dedicated model is only sketched in gaps. |
| Impact | 3 / 5 | Connecting arrangements and translations would improve library navigation for teams with many related charts. |
| Reach | 3 / 5 | Teams with multi-language or multi-arrangement catalogs; less valuable for tiny libraries. |
| Evidence | 3 / 5 | Future epic H-3 documents the naming collision and the need for a real song-to-song link model. |
| Strategic fit | 3 / 5 | Supports one conceptual song with multiple presentations, which fits the single-source idea. |
| Effort | 4 / 5 | New relationship model, APIs, hub/editor UI, migrations, and careful naming away from `SongLink` are a large change. |
| Delivery risk | 3 / 5 | Schema naming collisions and bidirectional vs typed links (translation, arrangement) need a migration plan. |

## Problem

Setlists and collections embed `shared::song::Link` (id, key, tempo). That is not a song-to-song relationship. Teams cannot mark "this German chart is the translation of that English chart" or "this is the acoustic arrangement" as a first-class model. Gaps.md warns a dedicated model collides with that name.

## Proposed outcome

Users can create typed relationships between songs and navigate them from hub and editor, using a name that does not collide with embed `SongLink`.

**In scope**

- A song-to-song relationship model (name TBD: not `song::Link`).
- Create/list/remove links with team-visible permissions.
- Navigation from a song to its relatives.

**Out of scope**

- Changing how setlists embed songs, except to avoid the name clash.
- Automatic duplicate detection as a required v1.

## Success criteria

- Two songs can be related and both sides can open the other (if the link is bidirectional) or follow the defined direction.
- API/docs never use `SongLink` for this feature.
- Unreadable related songs are omitted or concealed consistently with other library reads.

## Planning notes

- **Approach:** Follow gaps H-3: use a new type name; tags/metadata only as a stopgap.
- **Dependencies:** Song resource, search, OpenAPI.
- **Open questions:** Link types (translation, arrangement, medley part)? Cardinality? Cross-team links?
- **Risks and mitigations:** Name collision in OpenAPI; pick `SongRelation` (or similar) before writing schema.
