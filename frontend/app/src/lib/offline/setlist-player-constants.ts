/** Max number of setlist player payloads to retain (LRU by last opened). */
export const MAX_CACHED_SETLIST_PLAYERS = 5

/** Soft cap for all offline mirror bytes (JSON + blob ArrayBuffers) before LRU eviction. */
export const MAX_OFFLINE_PLAYER_BYTES = 200 * 1024 * 1024
