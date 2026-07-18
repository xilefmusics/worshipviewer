# Player Room realtime architecture

HTTP performs discovery, creation, invitation exchange, role claims, reconnect-ticket exchange, closing, and scoped media reads. A server-authoritative WebSocket carries presence and shared-state commands.

Room state is recoverable from SurrealDB; process memory contains active socket broadcasters only. Commands are checked against the room-local participant represented by their one-use connection ticket. The room host and AV host therefore remain separate even when both participants use the same account.

The client renders a complete snapshot before accepting incremental state. It tracks the latest revision, ignores older data, and requests a fresh snapshot after a gap. Reconnect uses a participant resume credential with bounded exponential backoff. Existing non-room AV output continues using the browser-local `BroadcastChannel` path.

Horizontal socket fan-out is intentionally unsupported until a shared pub/sub or database change-feed layer is introduced.
