---
name: create-story
description: Convert an existing Worship Viewer idea document into a researched, user-refined, implementation-ready story under docs/issues. Use after an idea follows the repository idea template; do not use for raw ideas or bugs.
---

# Create Story

Turn one existing idea into one small, valuable, testable story. Research what
can be discovered, challenge the proposal with the user, retain the idea's slug
as provenance, and remove the promoted idea after successful story creation.

## Workflow

1. Read `docs/issues/templates/story-template.md`, the `## Stories` and
   `## Ideas` tables in `docs/issues/Readme.md`, and the requested source document under
   `docs/issues/ideas/`. Also read `docs/issues/templates/idea-template.md` to
   interpret its fields. If the source idea is missing or does not substantially
   follow that template, explain what is missing and stop; do not silently turn
   raw input into an idea.
2. Establish the slice before drafting. If the idea contains multiple actors,
   workflows, or independently valuable outcomes, propose a small set of story
   slices and ask the user which one to refine. Create one story per invocation
   unless the user explicitly requests multiple stories.
3. Investigate before asking questions:
   - Search the repository for the current user flow, domain rules, related
     issues, relevant code and tests, dependencies, and likely constraints.
   - Research external standards, platform behavior, or comparable products
     when this could materially change the behavior, scope, risks, or acceptance
     criteria. Prefer primary sources and retain URLs plus access dates.
   - Separate repository facts, externally sourced facts, user decisions, and
     inference. Do not browse just to make the story appear researched.
4. Interview the user in focused rounds of at most three questions. Ask one
   round, wait for answers, incorporate them, and then ask the next highest-value
   questions. Pressure-test vague or contradictory answers. Resolve, as needed:
   - the primary actor, trigger, current workflow, and desired outcome;
   - the smallest valuable scope and explicit non-goals;
   - observable acceptance criteria and success/failure behavior;
   - permissions, data ownership, privacy, accessibility, compatibility, and
     rollout expectations;
   - edge cases, acceptable trade-offs, and evidence behind key assumptions.
   Never ask the user for a fact that repository or external research can answer.
5. Before writing, present a compact proposed story containing the user-story
   sentence, scope, key acceptance criteria, weakest assumption, and unresolved
   decisions. Ask the user to correct or approve it. Continue interviewing while
   an ambiguity would materially change behavior or scope. If the user instructs
   you to draft despite uncertainty, record it under open questions.
6. Derive a concise outcome-oriented title and unique lowercase kebab-case slug.
   Create `docs/issues/stories/<slug>.md` from the story template. Never overwrite
   an existing story. Set `status` to `ready` only when the user approved the
   synthesis and no material behavior or scope decision remains; otherwise use
   `draft`. Set `last_reviewed` to today's date, `owner` to `null` unless
   identified, and `source_idea` to the source idea's lowercase kebab-case slug.
7. Write acceptance criteria as independently verifiable behavior. Use
   Given/When/Then where it improves precision, and cover the happy path plus
   material permission, error, empty, and boundary cases. Keep implementation
   ideas non-binding under delivery notes unless the repository or user makes
   them constraints.
8. In `Research`, include only findings that changed the story. Cite repository
   paths and primary external sources inline, state each implication, and label
   inference. Do not fabricate evidence or describe the interview as user
   research.
9. Append one row to the Stories table with a relative story link, the source
   idea title as plain text, area, persona, and status. Preserve existing rows
   and other sections. Escape pipe characters that would break the Markdown
   table.
10. Validate YAML front matter, confirm every placeholder is replaced, verify
    that criteria are testable, and confirm the story and index retain the source
    idea's slug or title as provenance.
11. Only after the story and Stories row pass validation, remove the source
    idea's row from the Ideas table and delete its document. Revalidate that the
    story and index contain no link to the deleted path and that no unrelated
    idea rows changed. If creation or validation fails, keep the source idea
    intact so the promotion can be retried safely.
12. Report the created story, updated index, and removed source idea. Do not
    create a git commit, push, or open a remote issue unless explicitly requested.

## Interview posture

Be constructively skeptical without turning the conversation into an
interrogation. Ask concrete questions and explain why a non-obvious decision
matters. Challenge solution-first thinking, bundled scope, untested assumptions,
and missing failure behavior while preserving explicit product choices.
