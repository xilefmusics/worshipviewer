/** Max number of player payloads to retain (LRU by last opened). */
export const MAX_CACHED_PLAYERS = 10

/** Soft cap for offline player JSON mirrors before LRU eviction. */
export const MAX_OFFLINE_PLAYER_BYTES = 200 * 1024 * 1024
