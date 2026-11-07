# Room message contract

Rooms hold a fixed, source-ordered snapshot of chord songs. The room-scoped zero-based `song` index distinguishes captured entries even when their library song IDs match. A zero-based `slide` index refers to a source section in that entry. The server validates every reference against its cached room content. Initial replay state has no selection, no played songs and no votes. Display settings such as language, chord visibility and sheet layout remain local.

Each persisted change contains a unique client message ID, room ID, authenticated visit ID, server order and an absolute payload. The server derives visit identity from the one-use connection ticket; clients cannot set it. A new visit creates a fresh identity. A resume credential bound to both the account and room retains the identity for automatic socket reconnects. REST replay uses `x-room-resume`; the secret is never included in URLs or the message log.

```json
{"type":"selection","song":1,"slide":2,"activate":false}
{"type":"vote","song":1,"voted":true}
```

- `selection` replaces both song and slide. `activate: true` marks that fixed entry played and clears all votes. Selecting any song is an activation; moving between slides is not. Sheet navigation maps to the selected song with slide zero; AV section changes use the source section index.
- `vote` sets this visit's vote. Setting it to true also marks the song unplayed; setting it to false removes the vote without changing played state. Votes remain after the visit disconnects.
- The virtual queue contains each captured entry once. Rank unplayed entries first, then descending vote count, then original source index. It is derived from replay and is never separately persisted.

Order is `(epoch, sequence)`, compared lexicographically. A backend process durably reserves a new epoch before accepting changes to a room; its sequence begins at one. A single backend replica is required because live fan-out and current presence are process-local. Sequence gaps are expected when the bounded persistence queue is full. A restarted process uses a new epoch rather than guessing the last accepted sequence from incomplete history.

The client generates UUID message IDs and does not retry a send. Exact retries among the server's 4,096 most recent IDs in an active room are ignored; conflicting reuse in that window is rejected. The database append is idempotent for an exact room/ID/envelope retry. Live IDs are held in bounded memory and are cleared when an active room is evicted or the process restarts; clients must not reuse IDs. These choices keep live acceptance off the database path.

Accepted changes are broadcast to every socket, including the sender, before persistence. A 256-entry persistence queue retries each stored change up to three times; if the queue is full or retries fail, the message stays live and is absent from history. Later messages can still be stored. A successful history request can therefore omit messages, and no snapshot repairs those gaps. A later absolute selection repairs its own selection only; votes repair only their visit's vote and the associated unplayed effect. A lost final message can leave replay stale.

Joiners establish a ticket-authorized socket before requesting REST history. The socket captures an ordered boundary and buffers subsequent changes (up to 256) while REST returns the immutable room and saved history through that boundary. The client applies history, signals `history_ready`, then applies buffered changes after the boundary in server order. Messages at or before the boundary are excluded from the buffer, so the replay boundary is applied once. Presence is sent separately and is never replayed from history. A history request waits up to eight seconds for writes already queued through its boundary; deliberately dropped messages do not block it.

Presence is current process state. A disconnected visit stays online for a 30-second grace period; concurrent sockets for the same visit appear once. A room supports at most 500 visits, 1,000 sockets and four sockets per visit. WebSocket event buffers hold 128 messages, the handoff buffer holds 256, incoming text is limited to 32 KB, and a client is disconnected after a broadcast lag or a missed 60-second pong deadline. WebSocket tickets expire after two minutes and are consumed once.

Room creation and deletion require team write access. Any signed-in user who has the room link can join; anonymous users cannot. Existing room clients must be drained before the destructive forward migration. Back up the database first; the migration deletes old `room` and `room_session` rows and creates the replacement tables. This change has no deployed-data rollback path.

The opt-in client diagnostics viewer and JSON download show the same per-player session log. It includes replay/live source and server order, may be incomplete or contain duplicates, and is bounded to 1,000 entries or 512 KB. It contains no resume credential or connection ticket and is not a database export.
