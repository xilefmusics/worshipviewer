import type { components } from '@/api/schema'

import { fetchBlobBinaryWithMime } from '@/api/blob-data'
import { api } from '@/api/client'
import { parseProblemResponse } from '@/api/problem'
import {
  appDb,
  playerMirrorId,
  type OfflineBlobRow,
  type PlayerMirrorEntityType,
  type PlayerMirrorRow,
} from '@/lib/dexie-db'
import { collectBlobIdsFromPlayer } from '@/lib/offline/collect-blob-ids'
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
  return utf8ByteLength(row.playerJson) + row.blobIds.length * 32
}

function toMirrorEntityType(type: PlayerEntityType): PlayerMirrorEntityType {
  return type
}

async function totalMirrorAndBlobBytes(): Promise<number> {
  let n = 0
  const mirrors = await appDb.playerMirror.toArray()
  for (const m of mirrors) {
    n += mirrorRowBytes(m)
  }
  const blobs = await appDb.offlineBlobs.toArray()
  for (const b of blobs) {
    n += b.bytes.byteLength
  }
  return n
}

/** Remove one LRU player mirror and delete blobs no longer referenced. */
export async function evictOnePlayerMirror(mirrorId: string): Promise<void> {
  const row = await appDb.playerMirror.get(mirrorId)
  if (!row) return

  await appDb.playerMirror.delete(mirrorId)

  for (const bid of row.blobIds) {
    let refs = 0
    await appDb.playerMirror.each((m) => {
      if (m.blobIds.includes(bid)) refs += 1
    })
    if (refs === 0) {
      await appDb.offlineBlobs.delete(bid)
    }
  }
}

/** @deprecated Use evictOnePlayerMirror */
export async function evictOneSetlistMirror(setlistId: string): Promise<void> {
  await evictOnePlayerMirror(playerMirrorId('setlist', setlistId))
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

  let total = await totalMirrorAndBlobBytes()
  mirrors = await appDb.playerMirror.orderBy('lastOpenedAt').toArray()
  let safety = 0
  while (total > MAX_OFFLINE_PLAYER_BYTES && mirrors.length > 1 && safety < 64) {
    safety += 1
    const victim = mirrors.find((m) => m.id !== exemptMirrorId) ?? mirrors[0]
    if (!victim) break
    await evictOnePlayerMirror(victim.id)
    total = await totalMirrorAndBlobBytes()
    mirrors = await appDb.playerMirror.orderBy('lastOpenedAt').toArray()
  }
}

async function downloadBlobBytes(
  blobIds: string[],
  signal?: AbortSignal,
): Promise<Map<string, { buffer: ArrayBuffer; mime: string | null }>> {
  const out = new Map<string, { buffer: ArrayBuffer; mime: string | null }>()
  const now = Date.now()
  for (const id of blobIds) {
    const existing = await appDb.offlineBlobs.get(id)
    if (existing) {
      existing.lastTouchedAt = now
      await appDb.offlineBlobs.put(existing)
      out.set(id, { buffer: existing.bytes, mime: existing.mime })
      continue
    }
    const meta = await fetchBlobBinaryWithMime(id, signal)
    if (!meta) {
      throw new Error(`BlobMissing:${id}`)
    }
    out.set(id, meta)
  }
  return out
}

async function writeMirrorAndBlobs(
  row: PlayerMirrorRow,
  blobBytes: Map<string, { buffer: ArrayBuffer; mime: string | null }>,
): Promise<void> {
  const now = Date.now()
  await appDb.transaction('rw', [appDb.playerMirror, appDb.offlineBlobs], async () => {
    for (const id of row.blobIds) {
      const pack = blobBytes.get(id)
      if (!pack) continue
      await appDb.offlineBlobs.put({
        blobId: id,
        bytes: pack.buffer,
        mime: pack.mime,
        lastTouchedAt: now,
      })
    }
    await appDb.playerMirror.put(row)
  })
}

export type PersistPlayerMirrorOptions = {
  signal?: AbortSignal
  title?: string
}

/**
 * After a successful online player fetch: store JSON + blob bytes, enforce LRU.
 */
export async function persistPlayerMirror(
  entityType: PlayerEntityType,
  entityId: string,
  player: Player,
  options?: PersistPlayerMirrorOptions,
): Promise<void> {
  const mirrorType = toMirrorEntityType(entityType)
  const id = playerMirrorId(mirrorType, entityId)
  const blobIds = collectBlobIdsFromPlayer(player)
  const playerJson = JSON.stringify(player)
  const openedAt = Date.now()
  const row: PlayerMirrorRow = {
    id,
    entityType: mirrorType,
    entityId,
    playerJson,
    blobIds,
    lastOpenedAt: openedAt,
    title: options?.title,
  }

  const attempt = async () => {
    const blobBytes = await downloadBlobBytes(blobIds, options?.signal)
    await writeMirrorAndBlobs(row, blobBytes)
    await enforceOfflineRetention(id)
  }

  try {
    await attempt()
  } catch (e) {
    const isQuota =
      (e instanceof DOMException && e.name === 'QuotaExceededError') ||
      (e as Error)?.name === 'QuotaExceededError'
    if (isQuota) {
      await enforceOfflineRetention(id)
      const oldest = await appDb.playerMirror.orderBy('lastOpenedAt').first()
      if (oldest && oldest.id !== id) {
        await evictOnePlayerMirror(oldest.id)
      }
      await attempt()
      return
    }
    throw e
  }
}

/** @deprecated Use persistPlayerMirror */
export async function persistSetlistPlayerMirror(
  setlistId: string,
  player: Player,
  signal?: AbortSignal,
): Promise<void> {
  await persistPlayerMirror('setlist', setlistId, player, { signal })
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

/** @deprecated Use touchPlayerOpened */
export async function touchSetlistPlayerOpened(setlistId: string): Promise<void> {
  await touchPlayerOpened('setlist', setlistId)
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

  for (const blobId of row.blobIds) {
    const b = await appDb.offlineBlobs.get(blobId)
    if (!b) {
      return null
    }
  }

  await touchPlayerOpened(entityType, entityId)
  await enforceOfflineRetention(id)
  return parsed
}

/** @deprecated Use loadOfflinePlayer */
export async function loadOfflineSetlistPlayer(setlistId: string): Promise<Player | null> {
  return loadOfflinePlayer('setlist', setlistId)
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

export async function getCachedBlob(blobId: string): Promise<OfflineBlobRow | null> {
  const row = await appDb.offlineBlobs.get(blobId)
  if (!row) return null
  return {
    ...row,
    mime: row.mime ?? null,
  }
}

/** JSON + blob bytes used for offline playback mirror (excludes TanStack Query kv). */
export async function estimateOfflinePlayerCacheBytes(): Promise<number> {
  return totalMirrorAndBlobBytes()
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

/** Read legacy setlist mirror row (tests / migration helpers). */
export async function getPlayerMirrorRow(
  entityType: PlayerEntityType,
  entityId: string,
): Promise<PlayerMirrorRow | undefined> {
  return appDb.playerMirror.get(playerMirrorId(toMirrorEntityType(entityType), entityId))
}
