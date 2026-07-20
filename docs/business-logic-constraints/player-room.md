# Player Rooms

Player Rooms are ephemeral, team-owned, realtime player snapshots. They are distinct from authentication sessions.

- An authenticated member, including a team guest, may create a room from a readable song, collection, or setlist owned by that team. Public-library visibility alone is insufficient.
- Creation stores a content-only snapshot. Source edits, likes, layout, scrolling, and other local preferences never mutate an active room.
- The creator is the only room host and controls item, effective language, and transposition. A participant/device identity—not an account—owns each fixed Sheet, AV, or Slide role.
- At most one participant owns AV authority. AV controls only the structured projection payload; Slide participants are passive.
- Sheet participants choose a Chords or Text view when joining. Text hides chord symbols locally; the choice is stored on the participant record as `hide_chords`.
- Invite and resume credentials are high-entropy room-scoped secrets. The durable invite is stored only as a hash and becomes invalid when the room closes.
- WebSocket clients receive a complete snapshot before ordered field deltas. Desired-state command retries are idempotent, and revision gaps require one new snapshot.
- Active room clients heartbeat every 10 seconds. A heartbeat updates only narrow lease fields when revisions match; participant leases survive a brief disconnect for 30 seconds, and a room is considered closed after 30 seconds without its host heartbeat.
- Anonymous credentials can read only the captured room state and media IDs referenced by that snapshot. They never authorize normal library endpoints.
- The host can disable guest access at any time. While disabled, invite inspect/join rejects new anonymous participants; existing guest resume credentials still reconnect.
- Room expiry and participant expiry are event/request-driven; the backend does not scan or persist rooms on a schedule.
- Socket fan-out is immediate within one process. Across backend instances, clients converge from authoritative database state on the next active-room heartbeat; shared pub/sub is needed only to remove that bounded delay.

## Realtime messages

The WebSocket at `/api/v1/player-rooms/ws` accepts the connection ticket in the first JSON message, never in the URL.

Client message types are `authenticate`, `heartbeat`, `update_musical_state`, `update_projection`, `update_guests_allowed`, `request_snapshot`, and `leave`. Mutation messages carry a unique `command_id`.

Server message types are `snapshot`, `heartbeat`, `musical_state_updated`, `projection_updated`, `guests_allowed_updated`, `participants_changed`, `command_accepted`, `command_rejected`, and `room_ended`. Snapshots and deltas carry the current monotonically increasing room revision.
