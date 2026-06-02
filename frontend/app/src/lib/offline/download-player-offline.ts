import type { PlayerEntityType } from '@/lib/player-route'

import {
  fetchPlayerFromNetwork,
  isPlayerMirrored,
  persistPlayerMirror,
  removePlayerMirror,
} from '@/lib/offline/player-mirror-cache'

export type DownloadPlayerOfflineResult =
  | { ok: true; evicted?: boolean }
  | { error: 'offline' | 'network' | 'empty' | 'quota' | 'unknown'; message?: string }

function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine
}

/** Proactively fetch and mirror a player for offline use without opening the player route. */
export async function downloadPlayerForOffline(
  entityType: PlayerEntityType,
  entityId: string,
  options?: { signal?: AbortSignal; title?: string },
): Promise<DownloadPlayerOfflineResult> {
  if (!isOnline()) {
    return { error: 'offline' }
  }

  try {
    const res = await fetchPlayerFromNetwork(entityType, entityId, options?.signal)
    if ('error' in res) {
      return { error: 'network', message: res.error }
    }
    if (!res.player) {
      return { error: 'empty' }
    }

    let evicted = false
    try {
      await persistPlayerMirror(entityType, entityId, res.player, {
        title: options?.title,
      })
    } catch (e) {
      const isQuota =
        (e instanceof DOMException && e.name === 'QuotaExceededError') ||
        (e as Error)?.name === 'QuotaExceededError'
      if (isQuota) {
        evicted = true
        await persistPlayerMirror(entityType, entityId, res.player, {
          title: options?.title,
        })
      } else {
        throw e
      }
    }

    return { ok: true, evicted }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: 'unknown', message: msg }
  }
}

export async function removeOfflinePlayerCopy(
  entityType: PlayerEntityType,
  entityId: string,
): Promise<void> {
  await removePlayerMirror(entityType, entityId)
}

export { isPlayerMirrored }
