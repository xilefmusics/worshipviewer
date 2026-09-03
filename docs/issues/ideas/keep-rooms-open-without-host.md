---
title: "Keep Rooms open after the host leaves"
summary: "Let a Room stay available when the host disconnects, closing only by an explicit action or a chosen keep-open duration, and restore a reconnecting participant to their previous role."
area: "Rooms"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "improvement to an existing capability"
personas:
  - "worship leader"
  - "presenter"
  - "musician"
  - "AV team"
  - "viewer"
primary_persona: "worship leader"
benefit: "A brief host disconnect no longer ends the shared player for everyone, and returning participants land in the role they already had."

clarity:
  score: 3
  reason: "The desired lifecycle (manual close or optional duration, restore role on reconnect) is clear; who may close, host transfer, and default duration are not."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 4
  reason: "Today a room closes about 30 seconds after the host heartbeat stops, which can end a live service if the host's device drops."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Affects teams that use Rooms, not every library-only user."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 2
  reason: "The 30-second host-lease close is documented; demand for keep-open is the submitted idea rather than measured incidents."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 4
  reason: "Reliable shared player/projection is a core Room goal."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 3
  reason: "Lifecycle, optional duration, reconnect-to-role, realtime events, and tests are around a thousand lines across backend and client."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "Rooms that never expire, orphaned AV authority, and invite secrets that stay valid need careful expiry design."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Keep Rooms open after the host leaves

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 3 / 5 | The desired lifecycle (manual close or optional duration, restore role on reconnect) is clear; who may close, host transfer, and default duration are not. |
| Impact | 4 / 5 | Today a room closes about 30 seconds after the host heartbeat stops, which can end a live service if the host's device drops. |
| Reach | 3 / 5 | Affects teams that use Rooms, not every library-only user. |
| Evidence | 2 / 5 | The 30-second host-lease close is documented; demand for keep-open is the submitted idea rather than measured incidents. |
| Strategic fit | 4 / 5 | Reliable shared player/projection is a core Room goal. |
| Effort | 3 / 5 | Lifecycle, optional duration, reconnect-to-role, realtime events, and tests are around a thousand lines across backend and client. |
| Delivery risk | 3 / 5 | Rooms that never expire, orphaned AV authority, and invite secrets that stay valid need careful expiry design. |

## Problem

A Room is considered closed after about 30 seconds without a host heartbeat. Participant leases already survive a short disconnect, but the whole room ends if the host's device drops, which can interrupt a live set. Rejoining today does not guarantee the previous Sheet, AV, or Slide role.

## Proposed outcome

Rooms stay open when the host leaves. They close only when someone closes them, or after an optional keep-open duration chosen at creation. A reconnecting participant returns to the role they had before.

**In scope**

- Stop closing the room solely because the host lease expired.
- Optional keep-open duration at room creation, plus manual close.
- Restore the previous participant role on reconnect.

**Out of scope**

- Transferring host identity to another account as a separate product feature, unless required to keep musical control working.
- Changing invite hashing or guest-disable behavior except as needed for the new lifetime.

## Success criteria

- Participants keep receiving room state after the original host disconnects, until manual close or the chosen duration.
- A reconnecting participant is placed in their previous role when that role is still available.
- Rooms do not remain open indefinitely unless that was explicitly chosen.

## Planning notes

- **Approach:** Separate room lifetime from host heartbeat; keep participant resume credentials as the reconnect key; define who may send close when no host is present.
- **Dependencies:** Room lease/close rules and the WebSocket `room_ended` path.
- **Open questions:** Who can close a hostless room? Does musical control freeze until the host returns, or can another member take it? What is the default duration? How long is a previous role reserved?
- **Risks and mitigations:** Abandoned rooms and still-valid invites; require a duration cap, keep close available to the creating team, and audit leftover rooms.
