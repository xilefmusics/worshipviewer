/** Max number of player payloads to retain (LRU by last opened). */
export const MAX_CACHED_PLAYERS = 10

/** Soft cap for all offline mirror bytes (JSON + blob ArrayBuffers) before LRU eviction. */
export const MAX_OFFLINE_PLAYER_BYTES = 200 * 1024 * 1024

/** @deprecated Use MAX_CACHED_PLAYERS */
export const MAX_CACHED_SETLIST_PLAYERS = MAX_CACHED_PLAYERS
