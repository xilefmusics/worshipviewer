import type { QueryClient } from '@tanstack/react-query'
import type { components } from '@/api/schema'

import { api } from '@/api/client'

import { redirectToLoginAfterUnauthorized } from '@/lib/api-unauthorized'
import type { ResolvedPlayerState } from '@/lib/offline/resolve-player'
import { playerQueriesRootKey, songDetailQueryKey } from '@/lib/setlist-detail-key'

type Player = components['schemas']['Player']
type Song = components['schemas']['Song']

function updatePlayerLike(player: Player, songId: string, liked: boolean): Player {
  return {
    ...player,
    toc: player.toc.map((row) => (row.id === songId ? { ...row, liked } : row)),
    items: player.items.map((item) =>
      item.type === 'chords' && item.song.id === songId
        ? {
            ...item,
            song: {
              ...item.song,
              user_specific_addons: { ...item.song.user_specific_addons, liked },
            },
          }
        : item,
    ),
  }
}

function updateResolvedPlayerLike(
  state: ResolvedPlayerState | undefined,
  songId: string,
  liked: boolean,
): ResolvedPlayerState | undefined {
  if (state?.status !== 'ready') return state
  return { ...state, player: updatePlayerLike(state.player, songId, liked) }
}

function reconcileCachedLike(queryClient: QueryClient, songId: string, liked: boolean): void {
  queryClient.setQueriesData<ResolvedPlayerState>(
    { queryKey: playerQueriesRootKey() },
    (state) => updateResolvedPlayerLike(state, songId, liked),
  )
  queryClient.setQueryData<Song>(songDetailQueryKey(songId), (song) =>
    song
      ? {
          ...song,
          user_specific_addons: { ...song.user_specific_addons, liked },
        }
      : song,
  )
  void queryClient.invalidateQueries({ queryKey: ['room-queue-liked-song-ids'] })
}

function problemTitle(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'title' in body) {
    const t = (body as { title?: string }).title
    if (typeof t === 'string' && t) return t
  }
  return `Request failed (${status})`
}

export async function setSongLikeStatus(
  queryClient: QueryClient,
  args: { id: string; liked: boolean; signal?: AbortSignal },
): Promise<void> {
  const { id, liked, signal } = args
  const result = liked
    ? await api.PUT('/api/v1/songs/{id}/like', {
        params: { path: { id } },
        signal,
      })
    : await api.DELETE('/api/v1/songs/{id}/like', {
        params: { path: { id } },
        signal,
      })

  const { response, error } = result
  if (response.status === 401) await redirectToLoginAfterUnauthorized(queryClient)
  if (!response.ok) {
    throw new Error(problemTitle(response.status, error))
  }
  reconcileCachedLike(queryClient, id, liked)
}
