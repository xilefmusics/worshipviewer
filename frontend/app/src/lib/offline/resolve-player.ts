import type { components } from '@/api/schema'

import {
  fetchPlayerFromNetwork,
  loadOfflinePlayer,
  persistPlayerMirror,
} from '@/lib/offline/player-mirror-cache'
import { reconcilePlayer404 } from '@/lib/player/server-deleted-reconciliation'
import type { PlayerEntityType } from '@/lib/player-route'

type Player = components['schemas']['Player']

export type ResolvedPlayerState =
  | { status: 'ready'; player: Player; source: 'network' | 'offline'; deletedReconciled?: boolean }
  | { status: 'error'; message: string }
  | { status: 'offline_unavailable'; message: string }

const NOT_CACHED_MESSAGE: Record<PlayerEntityType, string> = {
  setlist: 'offlinePlayer.setlistNotCached',
  collection: 'offlinePlayer.collectionNotCached',
  song: 'offlinePlayer.songNotCached',
}

function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine
}

export async function fetchNonSetlistPlayer(
  type: Exclude<PlayerEntityType, 'setlist'>,
  id: string,
  signal?: AbortSignal,
): Promise<{ player: Player } | { error: string }> {
  const res = await fetchPlayerFromNetwork(type, id, signal)
  if ('error' in res) {
    return { error: res.error }
  }
  return { player: res.player }
}

/**
 * Resolve `Player` for the emergency / full player route with offline mirror support.
 */
export async function resolvePlayerForRoute(
  type: PlayerEntityType,
  id: string,
  signal?: AbortSignal,
): Promise<ResolvedPlayerState> {
  if (isOnline()) {
    const res = await fetchPlayerFromNetwork(type, id, signal)
    if ('error' in res) {
      const reconciled = await reconcilePlayer404(type, id, res.status)
      if (reconciled.kind === 'reconciled') {
        return {
          status: 'ready',
          player: reconciled.player,
          source: 'network',
          deletedReconciled: true,
        }
      }
      return { status: 'error', message: res.error }
    }
    try {
      await persistPlayerMirror(type, id, res.player, { signal })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { status: 'error', message: msg }
    }
    return { status: 'ready', player: res.player, source: 'network' }
  }

  const offline = await loadOfflinePlayer(type, id)
  if (!offline) {
    return {
      status: 'offline_unavailable',
      message: NOT_CACHED_MESSAGE[type],
    }
  }
  return { status: 'ready', player: offline, source: 'offline' }
}
