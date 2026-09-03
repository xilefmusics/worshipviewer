---
title: "Create independent team Rooms"
summary: "Let team administrators and content maintainers create an empty team-owned Room from the Rooms area and enter it immediately."
area: "Rooms"
status: "ready"
owner: null
last_reviewed: "2026-09-01"

source_idea: "independent-room-management"
persona: "worship leader"
need: "create and enter a team Room without first opening a song, collection, setlist, or player"
benefit: "the shared room exists independently of whichever content will be used in it later"
---

[← Back to issues README](../Readme.md)

# Story: Create independent team Rooms

## User story

As a **worship leader**, I want **to create and enter an empty team Room from the Rooms area**, so that **the shared room exists independently of whichever content will be used in it later**.

## Context

The promoted idea `independent-room-management` separates Rooms from source players. Today the create request requires a readable song, collection, or setlist; the backend derives room ownership, title, and immutable content from that source. The only create control is inside a source player, while the Rooms area can list and join rooms but cannot create one.

The smallest approved slice creates the independent room shell. An authorized user chooses one writable team, creates a room with a generated name and no source content, and enters its normal Sheet view immediately. Choosing songs from inside the room and changing the generated name are deliberately later work.

## Desired behavior

1. An administrator or content maintainer opens the Rooms area and starts creation.
2. The create flow offers only teams on which that user is currently an administrator or content maintainer.
3. The user selects a team and confirms creation; no song, collection, setlist, mode, or room-name input is requested.
4. Worship Viewer creates a team-owned room with a stable, non-empty generated name, records the authenticated user as host, and creates an empty content state.
5. The app saves the returned room credentials and immediately opens the room in its normal Sheet view.
6. The room shows a purposeful empty state instead of a loading screen, broken player, or AV/Slide surface.

## Acceptance criteria

- [ ] Given a user who is an administrator or content maintainer of at least one team, when they open Rooms while online, then an enabled create-room action is available.
- [ ] Given an authorized user belongs to multiple writable teams, when they open room creation, then they can choose among those teams and cannot choose teams on which they are only a guest.
- [ ] Given an authorized user belongs to exactly one writable team, when they create a room, then the flow uses that team without requiring an unnecessary team choice.
- [ ] Given a user is only a guest on every team, when they open Rooms, then the UI does not offer room creation.
- [ ] Given a guest submits a create request directly, when the backend authorizes it, then it rejects the request and creates no room.
- [ ] Given valid creation, when the backend persists the room, then it is owned by the selected team, has no song/collection/setlist source dependency, has an empty content state, has a stable non-empty generated name, and identifies the authenticated user—not their device—as host.
- [ ] Given valid creation succeeds, when the client receives the response, then it stores the room credentials and immediately navigates into that room in Sheet view.
- [ ] Given the host enters a newly created empty room, when its snapshot loads, then a localized empty-room state is rendered and host-level room controls remain reachable.
- [ ] Given room creation fails, when the backend returns an authorization, validation, network, or server error, then the user remains in the creation/list experience, sees an actionable error, and no unusable local room credential is retained.
- [ ] Given any ordinary song, collection, setlist, Sheet, or AV player, when its header actions render, then no create-Room action is present.
- [ ] Given the app is offline, when Rooms renders, then creation is unavailable and the existing online-required behavior remains clear.

## Scope

**In scope**

- A create-room action in the Rooms area.
- Choosing the owning team from teams where the user is an administrator or content maintainer.
- Backend enforcement of the same create permission.
- A source-independent, empty Room domain/API representation.
- Automatic creation of a stable, non-empty room name; no naming input.
- Binding the host to the authenticated user at creation.
- Immediate entry into the room in Sheet view.
- A localized empty-room state with access to applicable host room controls.
- Removing room creation from source-player controls.
- OpenAPI, business-rule, architecture-flow, frontend, backend, migration, and authorization-test updates required by the new contract.

**Out of scope**

- Browsing, searching, adding, removing, or playing the host's songs inside the room.
- Loading a song, collection, or setlist into a room during creation.
- Renaming a room or building a room settings page.
- Letting the creator choose Sheet, AV, or Slide mode during creation; new hosts start in Sheet view.
- Changing invitations, participant role selection, persistence, closing permissions, or host-rejoin behavior beyond the data shape needed for creation.
- Defining the final prose format of the generated room name, provided it is non-empty, stable, localized where necessary, and distinguishable in a room list.

## Edge cases and failure behavior

- A user with no writable teams sees the existing room list/empty state but no enabled create action.
- A role change between loading the team chooser and submitting creation is resolved by backend authorization; stale frontend eligibility never grants access.
- An empty room must not construct a player with an invalid item index or remain indefinitely in the generic loading state.
- A generated name collision does not change room identity; the room ID remains authoritative. The display format should make simultaneous rooms reasonably distinguishable.
- If navigation fails after successful creation, the created room remains discoverable from the Rooms list and the client must not create a second room automatically.

## Constraints

- Creation is online-only.
- The backend, not the client, is authoritative for team role and host identity.
- Team guests must not gain create permission through direct API use.
- Empty content must be a first-class valid state; it must not be represented by a fabricated source ID or placeholder song.
- The room create contract must not expose or persist device identity as host ownership.
- Empty-state actions must follow existing keyboard, focus, localization, and contrast conventions.

## Research

| Finding | Source | Implication |
|---|---|---|
| The current create request requires `source_type`, `source_id`, host mode, musical state, and optional projection; the REST handler reads that source and derives its team owner, title, and player snapshot. | [`shared/src/room.rs`](../../../shared/src/room.rs), [`backend/src/resources/room/rest.rs`](../../../backend/src/resources/room/rest.rs) | Independent creation needs an API/domain contract that does not fabricate a source and takes an owning team explicitly. |
| The current backend permits any authenticated member of the source-owning team, including guests, to create a room. Admin and content-maintainer roles are already distinct in authorization context. | [`docs/business-logic-constraints/room.md`](../../business-logic-constraints/room.md), [`backend/src/auth/context.rs`](../../../backend/src/auth/context.rs) | The new rule must be enforced server-side as a deliberate permission tightening. |
| The frontend already centralizes “writable team” selection as administrators plus content maintainers. | [`frontend/app/src/hooks/useWritableTeams.ts`](../../../frontend/app/src/hooks/useWritableTeams.ts), [`frontend/app/src/lib/team-permissions.ts`](../../../frontend/app/src/lib/team-permissions.ts) | The create flow can reuse established team eligibility, while still treating backend authorization as authoritative. |
| Room creation is implemented by `StartRoomButton` inside player chrome; the Rooms list only joins existing rooms. | [`frontend/app/src/components/room/StartRoomButton.tsx`](../../../frontend/app/src/components/room/StartRoomButton.tsx), [`frontend/app/src/components/room/RoomsList.tsx`](../../../frontend/app/src/components/room/RoomsList.tsx), [`frontend/app/src/components/player/av/PlayerAv.tsx`](../../../frontend/app/src/components/player/av/PlayerAv.tsx) | Delivery must add a hub create path and remove the coupled player action. |
| The live room page converts every snapshot to a source-backed player and shows loading until a player and participant exist. | [`frontend/app/src/components/room/RoomLivePage.tsx`](../../../frontend/app/src/components/room/RoomLivePage.tsx) | Empty rooms require an explicit render state rather than passing empty content into existing player assumptions. |
| The database schema requires source fields and stores host authority as a participant ID. | [`backend/db-migrations/20260718120000_define_rooms.surql`](../../../backend/db-migrations/20260718120000_define_rooms.surql) | A migration is required for optional source metadata and durable user-host identity; placeholders would create long-term schema debt. |

## Delivery notes

- **Likely affected areas:** Room shared types, database migration and service/create authorization, REST/OpenAPI contract, `RoomsList`, hub create/FAB behavior, `RoomLivePage`, removal of `StartRoomButton` usage, translations, business constraints, architecture/user-flow docs, and backend/frontend tests.
- **Dependencies:** Existing team-role authorization, writable-team list/query patterns, room credential storage, and authenticated Rooms routes.
- **Risks and mitigations:** Empty content can violate player invariants—render a dedicated empty shell and test zero items. Client-only permission checks can be bypassed—authorize the selected team on the server. A successful create followed by failed navigation can tempt duplicate creation—make the room discoverable and never retry POST automatically.
- **Open questions:** None that change behavior. The exact generated-name wording is a design choice and future room settings may replace it.

## Verification

- Add backend API/service tests for admin and content-maintainer success, guest/outsider rejection, selected-team ownership, source-free persistence, generated naming, empty content, and authenticated-user host binding.
- Add migration coverage for the new optional/removed source fields and host-user field.
- Add frontend tests for zero/one/multiple writable teams, offline behavior, success navigation and credential storage, failure recovery, and the empty Sheet-view room shell.
- Assert source players no longer render or invoke room creation.
- Regenerate and verify the OpenAPI tri-copy, update Room business constraints and architecture flows, then run the required backend and frontend quality gates.
