import type { QueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import type { components } from '@/api/schema'

import { redirectToLoginAfterUnauthorized } from '@/lib/api-unauthorized'

import { fetchSongForHubSlot, type Song } from '@/api/setlists-detail'

export type { Song } from '@/api/setlists-detail'

function problemTitle(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'title' in body) {
    const t = (body as { title?: string }).title
    if (typeof t === 'string' && t) return t
  }
  return `Request failed (${status})`
}

/** Load one song for the editor; throws when missing or inaccessible. */
export async function fetchSongDetail(
  queryClient: QueryClient,
  args: { id: string; signal?: AbortSignal },
): Promise<Song> {
  const song = await fetchSongForHubSlot(queryClient, args)
  if (song == null) throw new Error('Song not found')
  return song
}

export type PatchSongBody = components['schemas']['PatchSong']

export async function patchSong(
  queryClient: QueryClient,
  args: { id: string; body: PatchSongBody; signal?: AbortSignal },
): Promise<Song> {
  const { data, response, error } = await api.PATCH('/api/v1/songs/{id}', {
    params: { path: { id: args.id } },
    body: args.body,
    signal: args.signal,
  })
  if (response.status === 401) await redirectToLoginAfterUnauthorized(queryClient)
  if (!response.ok) {
    throw new Error(problemTitle(response.status, error))
  }
  if (!data) throw new Error('Empty response')
  return data
}
