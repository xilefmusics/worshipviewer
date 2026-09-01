# Player Rooms

Player Rooms are durable-until-closed, team-owned, realtime player snapshots. They are distinct from authentication sessions.

- A team administrator or content maintainer may create a room for that team. Guests and non-members cannot create rooms, and backend authorization is authoritative if membership changes while the create UI is open.
- Creation is source-independent: the room has no song, collection, or setlist metadata, starts with an empty content snapshot and default musical state, and opens the creator in Sheet mode.
- A creator may provide a room name of up to 80 characters; blank or omitted names receive a generated worship-themed verb/noun name. The backend persists the authenticated user's account ID as durable host ownership. Participant IDs remain connection-scoped authority for realtime commands.
- A room snapshot is immutable until content-management support is added. Source edits, likes, layout, scrolling, and other local preferences never mutate an active room.
- The creator's authenticated account is the only room host. Host authority survives device disconnects, participant lease expiry, and loss of a device resume credential. When content is present, the host controls item, effective language, and transposition; each participant keeps a fixed Sheet, AV, or Slide connection role.
- At most one participant owns AV authority. AV controls only the structured projection payload; Slide participants are passive.
- Sheet participants choose a Chords or Text view when joining. Text hides chord symbols locally; the choice is stored on the participant record as `hide_chords`.
- Invite and resume credentials are high-entropy room-scoped secrets. The durable invite is stored only as a hash and becomes invalid when the room closes.
- WebSocket clients receive a complete snapshot before ordered field deltas. Desired-state command retries are idempotent, and revision gaps require one new snapshot.
- Active room clients heartbeat every 10 seconds. Participant leases survive a brief disconnect for 30 seconds and independently determine presence and AV occupancy; a room remains open until an authorized user explicitly closes it.
- The host, a current team administrator, or a current content maintainer may close the room. Close authorization is evaluated from the current authenticated account and team role on every request; guests, unrelated users, and anonymous participants cannot close it.
- Anonymous credentials can read only the captured room state and media IDs referenced by that snapshot. They never authorize normal library endpoints.
- The host can disable guest access at any time. While disabled, invite inspect/join rejects new anonymous participants; existing guest resume credentials still reconnect.
- Participant expiry is event/request-driven; the backend does not scan or persist rooms on a schedule. The rollout migration closes already-expired historical rooms before lease filtering is removed.
- Socket fan-out is immediate within one process. Across backend instances, clients converge from authoritative database state on the next active-room heartbeat; shared pub/sub is needed only to remove that bounded delay.

## Realtime messages

The WebSocket at `/api/v1/player-rooms/ws` accepts the connection ticket in the first JSON message, never in the URL.

Client message types are `authenticate`, `heartbeat`, `update_musical_state`, `update_projection`, `update_guests_allowed`, `request_snapshot`, and `leave`. Mutation messages carry a unique `command_id`.

Server message types are `snapshot`, `heartbeat`, `musical_state_updated`, `projection_updated`, `guests_allowed_updated`, `participants_changed`, `command_accepted`, `command_rejected`, and `room_ended`. Snapshots and deltas carry the current monotonically increasing room revision.
