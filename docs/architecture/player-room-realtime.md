# Player Room realtime architecture

HTTP performs discovery, creation, invitation exchange, role claims, reconnect-ticket exchange, closing, and scoped media reads. A server-authoritative WebSocket carries presence and shared-state commands.

SurrealDB is authoritative for room state; process memory contains active socket broadcasters only. The captured content snapshot is written once, while commands update only their small mutable field and revision. Heartbeats perform narrow lease updates and read the captured snapshot only when their client revision is stale. Commands are checked against the room-local participant represented by their one-use connection ticket. The room host and AV host therefore remain separate even when both participants use the same account.

The client renders a complete snapshot before accepting incremental state. It tracks the latest revision, ignores older data, and requests a fresh snapshot after a gap. Reconnect uses a participant resume credential with bounded exponential backoff. Existing non-room AV output continues using the browser-local `BroadcastChannel` path.

There are no scheduled backend room jobs. Expiry is evaluated by the request or socket event that touches a room. Same-instance sockets receive deltas immediately through the process-local broadcaster. With multiple Cloud Run instances, SurrealDB remains the shared authority and a socket on another instance detects a revision change on its next active-room heartbeat and requests one fresh snapshot. Shared pub/sub or a database change feed remains an optional latency improvement for immediate cross-instance fan-out.
