import type { components } from '@/api/schema'

import { api } from '@/api/client'
import { parseProblemResponse } from '@/api/problem'
import {
  fetchSetlistPlayerFromNetwork,
  loadOfflineSetlistPlayer,
  persistSetlistPlayerMirror,
} from '@/lib/offline/setlist-player-cache'

import type { PlayerEntityType } from '@/lib/player-route'

type Player = components['schemas']['Player']

export type ResolvedPlayerState =
  | { status: 'ready'; player: Player; source: 'network' | 'offline' }
  | { status: 'error'; message: string }
  | { status: 'offline_unavailable'; message: string }

function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine
}

export async function fetchNonSetlistPlayer(
  type: Exclude<PlayerEntityType, 'setlist'>,
  id: string,
  signal?: AbortSignal,
): Promise<{ player: Player } | { error: string }> {
  if (type === 'song') {
    const { data, error, response } = await api.GET('/api/v1/songs/{id}/player', {
      params: { path: { id } },
      parseAs: 'json',
      signal,
    })
    if (!response.ok || error) {
      const problem = await parseProblemResponse(response.clone())
      return { error: problem?.title ?? 'Request failed' }
    }
    if (!data) {
      return { error: 'Empty response' }
    }
    return { player: data }
  }

  const { data, error, response } = await api.GET('/api/v1/collections/{id}/player', {
    params: { path: { id } },
    parseAs: 'json',
    signal,
  })
  if (!response.ok || error) {
    const problem = await parseProblemResponse(response.clone())
    return { error: problem?.title ?? 'Request failed' }
  }
  if (!data) {
    return { error: 'Empty response' }
  }
  return { player: data }
}

/**
 * Resolve `Player` for the emergency / full player route (E4 mirror rules for setlists only).
 */
export async function resolvePlayerForRoute(
  type: PlayerEntityType,
  id: string,
  signal?: AbortSignal,
): Promise<ResolvedPlayerState> {
  if (type !== 'setlist') {
    if (!isOnline()) {
      return {
        status: 'offline_unavailable',
        message: 'offlinePlayer.onlineOnlyType',
      }
    }
    const res = await fetchNonSetlistPlayer(type, id, signal)
    if ('error' in res) {
      return { status: 'error', message: res.error }
    }
    return { status: 'ready', player: res.player, source: 'network' }
  }

  if (isOnline()) {
    const res = await fetchSetlistPlayerFromNetwork(id, signal)
    if ('error' in res) {
      return { status: 'error', message: res.error }
    }
    try {
      await persistSetlistPlayerMirror(id, res.player, signal)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { status: 'error', message: msg }
    }
    return { status: 'ready', player: res.player, source: 'network' }
  }

  const offline = await loadOfflineSetlistPlayer(id)
  if (!offline) {
    return {
      status: 'offline_unavailable',
      message: 'offlinePlayer.setlistNotCached',
    }
  }
  return { status: 'ready', player: offline, source: 'offline' }
}
