# Room realtime architecture

Rooms use the ordered message contract documented in [room-message-contract.md](room-message-contract.md). The REST API lists, creates, joins, replays and deletes immutable message rooms. The WebSocket at `/api/v1/rooms/ws` consumes a one-use ticket in its first JSON message, then accepts only absolute `selection` and `vote` changes. Presence and the history handoff are separate ephemeral protocol events.

## State and persistence

`room` stores team ownership, room name and the captured `RoomContent` object. No playback, queue, vote or presence state is written back to room metadata. `room_change` stores message envelopes with epoch and sequence columns used for ordered reads. `room_visit` stores account-bound resume and one-use ticket hashes. `room_message_epoch:global` is incremented before a cold active-room process accepts changes.

Each active room has one process-local serializer, bounded broadcast channel, bounded persistence queue and presence tracker. The serializer validates song/slide references, assigns order and broadcasts immediately, including to the sender. A worker retries storage asynchronously. Queue overflow and exhausted retries create intentional history gaps; acceptance and broadcast do not imply durability. A restart may lose queued writes, then uses a new epoch to avoid sequence reuse.

This is a single-replica design. Multiple backend replicas would maintain separate active-room serializers, presence lists and socket fan-out; shared database storage alone does not make live rooms converge. Keep exactly one serving backend replica until cross-replica ordering and broadcast are implemented.

## Join and reconnect

The authenticated client joins using `/api/v1/rooms/{id}/join`. A missing resume credential creates a new visit; a valid credential resumes the visit for the same account and room. Each join returns a fresh one-use ticket. The authenticated socket consumes it and then sends the current complete presence list and a history boundary. The client requests `/api/v1/rooms/{id}/history` with its resume credential in `x-room-resume`, applies the saved room and messages through the boundary, then signals `history_ready`. The server drains its bounded handoff buffer after the boundary before switching to direct delivery.

The read waits at most eight seconds for queued writes through the boundary. Queue-dropped messages are not awaited. A successful history response may therefore omit messages without warning or in-memory repair. The live connection does not recover gaps. Presence lasts through a 30-second disconnect grace period and is never replayed from storage.

## Limits and operations

Persistence queues hold 256 messages per room; socket broadcasts and presence replacements hold 128 events; join handoff buffers 256 room changes. A visit appears once even with concurrent sockets. The service limits a room to 500 online visits, 1,000 sockets and four sockets per visit. Sockets send a ping every 20 seconds and are dropped when no pong arrives for 60 seconds. Incoming text is capped at 32 KB. Recent duplicate message IDs are held in a 4,096-ID active-room cache; client IDs are UUIDs, and the frontend does not retry sends.

The migration in `backend/db-migrations/20261106120000_prepare_message_rooms.surql` deletes old `room` and `room_session` records and creates the replacement schema. Later migrations use the final names `room` and `room_visit`, preserve room and visit data, and store room content as an object. Back up the database and stop/drain old room sockets before rollout. Old clients are incompatible and should not be deployed alongside the replacement. Run migration checks against the local in-memory SurrealDB; do not use production for development verification.
