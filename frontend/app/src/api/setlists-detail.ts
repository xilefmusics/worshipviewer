import type { QueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import type { components } from '@/api/schema'

import { redirectToLoginAfterUnauthorized } from '@/lib/api-unauthorized'

export type Setlist = components['schemas']['Setlist']
export type Song = components['schemas']['Song']

export class SetlistBrokenSongError extends Error {
  readonly name = 'SetlistBrokenSongError'
}

function problemTitle(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'title' in body) {
    const t = (body as { title?: string }).title
    if (typeof t === 'string' && t) return t
  }
  return `Request failed (${status})`
}

export async function fetchSetlistDetail(
  queryClient: QueryClient,
  args: { id: string; signal?: AbortSignal },
): Promise<Setlist> {
  const { data, response, error } = await api.GET('/api/v1/setlists/{id}', {
    params: { path: { id: args.id } },
    signal: args.signal,
  })
  if (response.status === 401) await redirectToLoginAfterUnauthorized(queryClient)
  if (!response.ok) {
    throw new Error(problemTitle(response.status, error))
  }
  if (!data) throw new Error('Empty response')
  return data
}

/** Shared song hydration for setlist / collection editor rows. */
export async function fetchSongForHubSlot(
  queryClient: QueryClient,
  args: { id: string; signal?: AbortSignal },
): Promise<Song | null> {
  const common = {
    params: { path: { id: args.id } },
    signal: args.signal,
    parseAs: 'json' as const,
    cache: 'reload' as RequestCache,
  }

  let { data, response } = await api.GET('/api/v1/songs/{id}', common)

  /** Empty JSON body on “successful” cache validators breaks hydration (`data.key` missing everywhere). */
  if (response.ok && data == null) {
    const second = await api.GET('/api/v1/songs/{id}', {
      ...common,
      headers: { Pragma: 'no-cache', 'Cache-Control': 'no-cache' },
    })
    data = second.data
    response = second.response
  }

  if (response.status === 401) {
    await redirectToLoginAfterUnauthorized(queryClient)
    throw new Error('Unauthorized')
  }
  if (response.status === 404 || response.status === 403) return null
  if (!response.ok) {
    throw new Error(problemTitle(response.status, data))
  }
  if (data == null) return null
  return data
}
