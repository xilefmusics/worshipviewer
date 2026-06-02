import type { components } from '@/api/schema'

import { api } from '@/api/client'
import { parseProblemResponse } from '@/api/problem'
import {
  appDb,
  playerMirrorId,
  type PlayerMirrorEntityType,
  type PlayerMirrorRow,
} from '@/lib/dexie-db'
import {
  MAX_CACHED_PLAYERS,
  MAX_OFFLINE_PLAYER_BYTES,
} from '@/lib/offline/player-mirror-constants'
import type { PlayerEntityType } from '@/lib/player-route'

type Player = components['schemas']['Player']

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength
}

function mirrorRowBytes(row: PlayerMirrorRow): number {
  return utf8ByteLength(row.playerJson)
}

function toMirrorEntityType(type: PlayerEntityType): PlayerMirrorEntityType {
  return type
}

async function totalMirrorBytes(): Promise<number> {
  let n = 0
  const mirrors = await appDb.playerMirror.toArray()
  for (const m of mirrors) {
    n += mirrorRowBytes(m)
  }
  return n
}

/** Remove one LRU player mirror. */
export async function evictOnePlayerMirror(mirrorId: string): Promise<void> {
  await appDb.playerMirror.delete(mirrorId)
}

/** Evict least-recently opened players until count and byte limits hold. */
export async function enforceOfflineRetention(exemptMirrorId?: string): Promise<void> {
  let mirrors = await appDb.playerMirror.orderBy('lastOpenedAt').toArray()

  while (mirrors.length > MAX_CACHED_PLAYERS) {
    const victim = mirrors.find((m) => m.id !== exemptMirrorId) ?? mirrors[0]
    if (!victim) break
    await evictOnePlayerMirror(victim.id)
    mirrors = await appDb.playerMirror.orderBy('lastOpenedAt').toArray()
  }

  let total = await totalMirrorBytes()
  mirrors = await appDb.playerMirror.orderBy('lastOpenedAt').toArray()
  let safety = 0
  while (total > MAX_OFFLINE_PLAYER_BYTES && mirrors.length > 1 && safety < 64) {
    safety += 1
    const victim = mirrors.find((m) => m.id !== exemptMirrorId) ?? mirrors[0]
    if (!victim) break
    await evictOnePlayerMirror(victim.id)
    total = await totalMirrorBytes()
    mirrors = await appDb.playerMirror.orderBy('lastOpenedAt').toArray()
  }
}

export type PersistPlayerMirrorOptions = {
  title?: string
}

/**
 * After a successful online player fetch: store player JSON for offline playback.
 */
export async function persistPlayerMirror(
  entityType: PlayerEntityType,
  entityId: string,
  player: Player,
  options?: PersistPlayerMirrorOptions,
): Promise<void> {
  const mirrorType = toMirrorEntityType(entityType)
  const id = playerMirrorId(mirrorType, entityId)
  const openedAt = Date.now()
  const row: PlayerMirrorRow = {
    id,
    entityType: mirrorType,
    entityId,
    playerJson: JSON.stringify(player),
    lastOpenedAt: openedAt,
    title: options?.title,
  }

  await appDb.playerMirror.put(row)
  await enforceOfflineRetention(id)
}

export async function touchPlayerOpened(
  entityType: PlayerEntityType,
  entityId: string,
): Promise<void> {
  const id = playerMirrorId(toMirrorEntityType(entityType), entityId)
  const row = await appDb.playerMirror.get(id)
  if (!row) return
  row.lastOpenedAt = Date.now()
  await appDb.playerMirror.put(row)
}

export async function loadOfflinePlayer(
  entityType: PlayerEntityType,
  entityId: string,
): Promise<Player | null> {
  const id = playerMirrorId(toMirrorEntityType(entityType), entityId)
  const row = await appDb.playerMirror.get(id)
  if (!row) return null
  let parsed: Player
  try {
    parsed = JSON.parse(row.playerJson) as Player
  } catch {
    return null
  }

  await touchPlayerOpened(entityType, entityId)
  await enforceOfflineRetention(id)
  return parsed
}

export async function isPlayerMirrored(
  entityType: PlayerEntityType,
  entityId: string,
): Promise<boolean> {
  const id = playerMirrorId(toMirrorEntityType(entityType), entityId)
  const row = await appDb.playerMirror.get(id)
  return row != null
}

export async function removePlayerMirror(
  entityType: PlayerEntityType,
  entityId: string,
): Promise<void> {
  const id = playerMirrorId(toMirrorEntityType(entityType), entityId)
  await evictOnePlayerMirror(id)
}

export async function listPlayerMirrors(): Promise<PlayerMirrorRow[]> {
  return appDb.playerMirror.orderBy('lastOpenedAt').reverse().toArray()
}

/** Player JSON mirrors in Dexie (excludes TanStack Query kv). */
export async function estimateOfflinePlayerCacheBytes(): Promise<number> {
  return totalMirrorBytes()
}

/** Rough size of persisted React Query dehydrate blob in Dexie `kv`. */
export async function estimateKvTableBytes(): Promise<number> {
  let n = 0
  await appDb.kv.each((row) => {
    n += utf8ByteLength(row.key) + utf8ByteLength(row.value)
  })
  return n
}

export async function fetchSetlistPlayerFromNetwork(
  setlistId: string,
  signal?: AbortSignal,
): Promise<{ player: Player } | { error: string; status: number }> {
  const { data, error, response } = await api.GET('/api/v1/setlists/{id}/player', {
    params: { path: { id: setlistId } },
    parseAs: 'json',
    signal,
  })
  if (!response.ok || error) {
    const problem = await parseProblemResponse(response.clone())
    return { error: problem?.title ?? 'Request failed', status: response.status }
  }
  if (!data) {
    return { error: 'Empty response', status: 500 }
  }
  return { player: data }
}

export async function fetchPlayerFromNetwork(
  entityType: PlayerEntityType,
  entityId: string,
  signal?: AbortSignal,
): Promise<{ player: Player } | { error: string; status: number }> {
  if (entityType === 'setlist') {
    return fetchSetlistPlayerFromNetwork(entityId, signal)
  }
  if (entityType === 'song') {
    const { data, error, response } = await api.GET('/api/v1/songs/{id}/player', {
      params: { path: { id: entityId } },
      parseAs: 'json',
      signal,
    })
    if (!response.ok || error) {
      const problem = await parseProblemResponse(response.clone())
      return { error: problem?.title ?? 'Request failed', status: response.status }
    }
    if (!data) return { error: 'Empty response', status: 500 }
    return { player: data }
  }
  const { data, error, response } = await api.GET('/api/v1/collections/{id}/player', {
    params: { path: { id: entityId } },
    parseAs: 'json',
    signal,
  })
  if (!response.ok || error) {
    const problem = await parseProblemResponse(response.clone())
    return { error: problem?.title ?? 'Request failed', status: response.status }
  }
  if (!data) return { error: 'Empty response', status: 500 }
  return { player: data }
}

/** Read mirror row (tests / migration helpers). */
export async function getPlayerMirrorRow(
  entityType: PlayerEntityType,
  entityId: string,
): Promise<PlayerMirrorRow | undefined> {
  return appDb.playerMirror.get(playerMirrorId(toMirrorEntityType(entityType), entityId))
}
