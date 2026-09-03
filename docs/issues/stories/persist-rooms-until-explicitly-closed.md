---
title: "Keep Rooms open until explicitly closed"
summary: "Keep team Rooms available across disconnects, restore host authority from the creator's account on any device, and allow authorized team maintainers to close them."
area: "Rooms"
status: "ready"
owner: null
last_reviewed: "2026-09-01"

source_idea: "independent-room-management"
persona: "worship leader"
need: "leave and later rejoin a Room without ending it or losing host authority"
benefit: "a device disconnect cannot interrupt or permanently orphan the team's shared room"
---

[← Back to issues README](../Readme.md)

# Story: Keep Rooms open until explicitly closed

## User story

As a **worship leader**, I want **to leave and later rejoin my Room without ending it or losing host authority**, so that **a device disconnect cannot interrupt or permanently orphan the team's shared room**.

## Context

The promoted idea `independent-room-management` makes room lifetime an explicit team decision. Today a room is active only while its host participant lease remains current. About 30 seconds after the host stops heartbeating, list, join, invite, state, reconnect, and media paths treat the room as ended even though `closed_at` is still empty. Host authority and close authorization are tied to the creator's participant resume credential, so a cleared browser or new device cannot recover the host role.

The approved behavior separates three concepts: durable room lifetime, account-bound host ownership, and short-lived participant presence. A room remains open until explicitly closed. The creator's authenticated user account remains its host across devices. The host and every current administrator or content maintainer of the owning team may close it; guests and anonymous participants may not.

## Desired behavior

1. Creating a room stores the host's authenticated user ID independently of any participant/device credential.
2. Host and participant sockets may disconnect or explicitly leave; presence updates, but the room remains open, listed, and joinable.
3. The same authenticated user can return on another device without an old resume credential and join as host.
4. Other authenticated team members and invited guests join only with their permitted participant role; account or email similarity never grants host authority.
5. The host, a current team administrator, or a current team content maintainer can explicitly close the room from an available room surface.
6. Closing marks the room ended, notifies active participants, removes it from active discovery, and invalidates further joins and invitations.

## Acceptance criteria

- [ ] Given an open room, when the host disconnects, closes the app, sends `leave`, or lets every participant lease expire, then the room remains open and its durable state is unchanged.
- [ ] Given an open room with no connected participants, when an authorized team member opens Rooms, then the room is still listed with zero active participants and can be joined.
- [ ] Given the original host signs in on a new device without the old resume credential, when they join their open room, then the backend recognizes the same user ID, creates or resumes a device participant as needed, and reports that participant as room host.
- [ ] Given a different user has the same display name or email text as a previous participant, when they join, then they do not receive host authority; identity is based on the authenticated user ID.
- [ ] Given the host was demoted to team guest but remains a team member, when that same user joins, then they still regain host authority and may close the room, but the demotion does not grant creation or maintainer permissions.
- [ ] Given the host no longer belongs to the owning team, when they try to discover or join the room, then normal team access rules deny access; a current administrator or content maintainer can still close the room.
- [ ] Given the host, an owning-team administrator, or an owning-team content maintainer requests close, when current authorization is checked, then the room closes even if that device has no original host resume credential.
- [ ] Given a team guest, unrelated authenticated user, or anonymous participant requests close, when current authorization is checked, then the request is rejected and the room remains open.
- [ ] Given a user's role changes after the room screen loads, when they request close, then the backend evaluates the latest authorization rather than trusting stale client state.
- [ ] Given an active client is connected when an authorized close succeeds, then it receives the terminal room-ended behavior and can no longer mutate or reconnect to that room.
- [ ] Given a room was closed, when a user lists, joins, reconnects, inspects/uses its invitation, reads scoped media, or sends a state command, then the operation fails using the existing non-disclosing ended/not-found behavior.
- [ ] Given a non-host participant disconnects, when their presence lease expires, then participant count and AV occupancy still reflect active presence without changing room lifetime.
- [ ] Given deployment encounters historical rows whose host leases expired before this behavior exists, when the migration runs, then those stale historical rooms are not resurrected as open rooms.

## Scope

**In scope**

- Room lifetime determined by explicit `closed_at` state rather than host heartbeat expiry.
- Durable host ownership by authenticated user ID.
- Same-account host restoration without a prior device resume credential.
- Continued participant/device credentials and leases for presence, fixed mode, tickets, and reconnect optimization.
- Explicit close permission for the host and current administrators/content maintainers of the owning team.
- Close controls on appropriate room/list surfaces for users currently authorized to close.
- Active-client room-ended notification and existing closed-room privacy behavior.
- A rollout migration that does not revive already expired historical rooms.
- API, OpenAPI, business-rule, architecture, authorization, lifecycle, and realtime test updates.

**Out of scope**

- Automatic room closing based on host absence, participant absence, age, or idle time.
- Scheduled cleanup of open rooms.
- Transferring host ownership to a different user.
- Multiple hosts or changing the host from a settings page.
- Room history, archive UI, restore/reopen, or permanent deletion of closed records.
- Allowing former team members to retain access solely because they once hosted a team-owned room.
- Changing how participant Sheet/AV/Slide roles, guest access, or AV exclusivity work except where lifetime separation requires it.

## Edge cases and failure behavior

- Clearing browser storage removes that device's participant resume secret but does not remove account-bound host ownership; signing in and joining creates a usable host participant.
- Simultaneous joins by the host account on multiple devices must not create multiple durable hosts. Each device may have its own participant presence, but host-only commands are authorized through the stored host user and the active participant representing it.
- An administrator/content maintainer can close a hostless room but does not become its host and does not gain host-only musical or guest-setting controls merely through close permission.
- A host removed from the team loses team-room access. The remaining privileged team members are the recovery path for closing that room.
- Concurrent close requests are idempotent from the user's perspective: the room ends once, clients receive terminal state, and repeated calls do not revive or partially close it.
- Restarting or scaling backend instances does not change open/closed state because the database remains authoritative.

## Constraints

- Room and host authorization must use server-side authenticated user/team context; email, display name, localStorage, and participant-provided fields are not authority.
- Invite, resume, and connection-ticket secrets remain high-entropy, hashed where durable, absent from URLs/logs, and scoped to the room.
- Participant presence must still expire so counts and exclusive AV occupancy do not remain stale indefinitely.
- Closed, unauthorized, and invalid public invitation failures must retain the existing non-disclosing behavior.
- Rollout must classify or close pre-change expired rows before removing host-lease filtering, preventing accidental resurrection and invitation reactivation.
- Closing remains online-only and requires explicit user action; no background scanner is introduced.

## Research

| Finding | Source | Implication |
|---|---|---|
| A room is currently active only when `closed_at` is empty **and** `host_lease_expires_at` is in the future; list and invite queries repeat the host-lease condition. | [`backend/src/resources/room/service.rs`](../../../backend/src/resources/room/service.rs) | Lifetime must be changed consistently across load, list, invite, command, reconnect, and media paths—not only in WebSocket disconnect handling. |
| Heartbeats renew the host lease every 10 seconds and participant leases last 30 seconds; expiry is request/event-driven with no scheduled scanner. | [`docs/business-logic-constraints/room.md`](../../business-logic-constraints/room.md), [`docs/architecture/room-realtime.md`](../../architecture/room-realtime.md) | Keep short participant leases for presence, but remove them from durable room lifetime; no scheduler is needed for explicit close. |
| The room stores `host_participant_id` and `host_email`; participant rows store optional `user_id`. Reconnect authenticates only a resume credential, and close checks the host participant's resume hash. | [`backend/db-migrations/20260718120000_define_rooms.surql`](../../../backend/db-migrations/20260718120000_define_rooms.surql), [`backend/src/resources/room/service.rs`](../../../backend/src/resources/room/service.rs), [`backend/src/resources/room/rest.rs`](../../../backend/src/resources/room/rest.rs) | Durable `host_user_id` and authenticated account-aware join/close authorization are required; rotating or losing a device secret must not lose ownership. |
| Team authorization represents Admin, ContentMaintainer, and Guest separately; writable-team helpers already treat the first two as privileged. | [`backend/src/auth/context.rs`](../../../backend/src/auth/context.rs), [`frontend/app/src/lib/team-permissions.ts`](../../../frontend/app/src/lib/team-permissions.ts) | Close permission can reuse the established privileged-role boundary but must be evaluated on every request. |
| Closed rooms already set `closed_at`, increment revision, publish `room_ended`, and make invites unusable. | [`backend/src/resources/room/service.rs`](../../../backend/src/resources/room/service.rs), [`frontend/app/src/lib/room.ts`](../../../frontend/app/src/lib/room.ts) | Preserve the terminal close semantics while broadening authorization and removing accidental lease-based endings. |
| **Inference:** expired historical rows can still have `closed_at = NONE` because expiry is computed rather than persisted. | [`backend/src/resources/room/service.rs`](../../../backend/src/resources/room/service.rs), [`backend/db-migrations/20260720090000_make_rooms_event_driven.surql`](../../../backend/db-migrations/20260720090000_make_rooms_event_driven.surql) | Simply dropping the lease predicate would resurrect old rooms and invitations; migration must close/classify them first. |

## Delivery notes

- **Likely affected areas:** Room schema/migration, shared snapshot/summary types, service activity predicates, list/invite/reconnect/join/close/media/command authorization, REST/OpenAPI, WebSocket host command checks, list/sidebar close UI, credential handling, business constraints, architecture docs, and backend/frontend tests.
- **Dependencies:** Authenticated user ID, current team role resolution, persisted room ownership and snapshots, terminal `room_ended` event, and existing non-disclosing public errors.
- **Risks and mitigations:** Dropping lease checks can resurrect old rooms—close/classify stale rows in migration. User-bound ownership can accidentally trust email—store and compare canonical user ID. Privileged close can leak existence—authorize team access and retain not-found behavior. Persistent rooms can accumulate—make authorized close discoverable; retention/settings are separate work.
- **Open questions:** None.

## Verification

- Add migration tests proving stale pre-change rooms/invites do not reappear and currently active open rooms remain open.
- Add backend service/API tests for survival after host/all-participant expiry, zero-participant listing, same-user new-device host restoration, impostor rejection, host and privileged-team close success, guest/outsider close rejection, role changes, former-member denial, idempotent/concurrent close, and closed-room denial across every access path.
- Add realtime tests proving presence/AV leases still expire independently and connected clients receive terminal room-ended state only after explicit close.
- Add frontend tests for host restoration, zero-participant room display, authorized close visibility, denied/stale-role failures, and ended state.
- Regenerate and verify OpenAPI, update Room business constraints and architecture docs, then run the required backend and frontend quality gates.
