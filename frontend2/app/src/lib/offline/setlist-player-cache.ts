import type { components } from '@/api/schema'

import { fetchBlobBinaryWithMime } from '@/api/blob-data'
import { api } from '@/api/client'
import { parseProblemResponse } from '@/api/problem'
import { appDb, type OfflineBlobRow, type SetlistPlayerMirrorRow } from '@/lib/dexie-db'
import { collectBlobIdsFromPlayer } from '@/lib/offline/collect-blob-ids'
import { MAX_CACHED_SETLIST_PLAYERS, MAX_OFFLINE_PLAYER_BYTES } from '@/lib/offline/setlist-player-constants'

type Player = components['schemas']['Player']

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength
}

function mirrorRowBytes(row: SetlistPlayerMirrorRow): number {
  return utf8ByteLength(row.playerJson) + row.blobIds.length * 32
}

async function totalMirrorAndBlobBytes(): Promise<number> {
  let n = 0
  const mirrors = await appDb.setlistPlayerMirror.toArray()
  for (const m of mirrors) {
    n += mirrorRowBytes(m)
  }
  const blobs = await appDb.offlineBlobs.toArray()
  for (const b of blobs) {
    n += b.bytes.byteLength
  }
  return n
}

/** Remove one LRU setlist mirror and delete blobs no longer referenced. */
export async function evictOneSetlistMirror(lruSetlistId: string): Promise<void> {
  const row = await appDb.setlistPlayerMirror.get(lruSetlistId)
  if (!row) return

  await appDb.setlistPlayerMirror.delete(lruSetlistId)

  for (const bid of row.blobIds) {
    let refs = 0
    await appDb.setlistPlayerMirror.each((m) => {
      if (m.blobIds.includes(bid)) refs += 1
    })
    if (refs === 0) {
      await appDb.offlineBlobs.delete(bid)
    }
  }
}

/** Evict least-recently opened setlists until count and byte limits hold. */
export async function enforceOfflineRetention(): Promise<void> {
  let mirrors = await appDb.setlistPlayerMirror.orderBy('lastOpenedAt').toArray()

  while (mirrors.length > MAX_CACHED_SETLIST_PLAYERS) {
    const victim = mirrors[0]
    if (!victim) break
    await evictOneSetlistMirror(victim.setlistId)
    mirrors = await appDb.setlistPlayerMirror.orderBy('lastOpenedAt').toArray()
  }

  let total = await totalMirrorAndBlobBytes()
  mirrors = await appDb.setlistPlayerMirror.orderBy('lastOpenedAt').toArray()
  let safety = 0
  while (total > MAX_OFFLINE_PLAYER_BYTES && mirrors.length > 1 && safety < 64) {
    safety += 1
    const victim = mirrors[0]
    if (!victim) break
    await evictOneSetlistMirror(victim.setlistId)
    total = await totalMirrorAndBlobBytes()
    mirrors = await appDb.setlistPlayerMirror.orderBy('lastOpenedAt').toArray()
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
  setlistId: string,
  playerJson: string,
  blobIds: string[],
  blobBytes: Map<string, { buffer: ArrayBuffer; mime: string | null }>,
  openedAt: number,
): Promise<void> {
  const now = Date.now()
  await appDb.transaction('rw', [appDb.setlistPlayerMirror, appDb.offlineBlobs], async () => {
    for (const id of blobIds) {
      const pack = blobBytes.get(id)
      if (!pack) continue
      await appDb.offlineBlobs.put({
        blobId: id,
        bytes: pack.buffer,
        mime: pack.mime,
        lastTouchedAt: now,
      })
    }
    await appDb.setlistPlayerMirror.put({
      setlistId,
      playerJson,
      blobIds,
      lastOpenedAt: openedAt,
    })
  })
}

/**
 * After a successful online `GET` for setlist player: store JSON + blob bytes, enforce LRU.
 */
export async function persistSetlistPlayerMirror(
  setlistId: string,
  player: Player,
  signal?: AbortSignal,
): Promise<void> {
  const blobIds = collectBlobIdsFromPlayer(player)
  const playerJson = JSON.stringify(player)
  const openedAt = Date.now()

  const attempt = async () => {
    const blobBytes = await downloadBlobBytes(blobIds, signal)
    await writeMirrorAndBlobs(setlistId, playerJson, blobIds, blobBytes, openedAt)
    await enforceOfflineRetention()
  }

  try {
    await attempt()
  } catch (e) {
    const isQuota =
      (e instanceof DOMException && e.name === 'QuotaExceededError') ||
      (e as Error)?.name === 'QuotaExceededError'
    if (isQuota) {
      await enforceOfflineRetention()
      const oldest = await appDb.setlistPlayerMirror.orderBy('lastOpenedAt').first()
      if (oldest && oldest.setlistId !== setlistId) {
        await evictOneSetlistMirror(oldest.setlistId)
      }
      await attempt()
      return
    }
    throw e
  }
}

/** Bump LRU timestamp when the user opens a setlist player (online or offline). */
export async function touchSetlistPlayerOpened(setlistId: string): Promise<void> {
  const row = await appDb.setlistPlayerMirror.get(setlistId)
  if (!row) return
  row.lastOpenedAt = Date.now()
  await appDb.setlistPlayerMirror.put(row)
}

export async function loadOfflineSetlistPlayer(setlistId: string): Promise<Player | null> {
  const row = await appDb.setlistPlayerMirror.get(setlistId)
  if (!row) return null
  let parsed: Player
  try {
    parsed = JSON.parse(row.playerJson) as Player
  } catch {
    return null
  }

  for (const id of row.blobIds) {
    const b = await appDb.offlineBlobs.get(id)
    if (!b) {
      return null
    }
  }

  await touchSetlistPlayerOpened(setlistId)
  await enforceOfflineRetention()
  return parsed
}

export async function getCachedBlob(blobId: string): Promise<OfflineBlobRow | null> {
  const row = await appDb.offlineBlobs.get(blobId)
  if (!row) return null
  return {
    ...row,
    mime: row.mime ?? null,
  }
}

/** JSON + blob bytes used for emergency playback mirror (excludes TanStack Query kv). */
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

/**
 * Online-only: fetch setlist player from API (authoritative). Does **not** read Dexie on failure.
 */
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
    return { error: 'Empty response', status: response.status || 500 }
  }
  return { player: data }
}
