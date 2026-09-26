import type { QueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import type { components } from '@/api/schema'
import { redirectToLoginAfterUnauthorized } from '@/lib/api-unauthorized'
import { parseTotalCount } from '@/lib/list-pagination'

export type Collection = components['schemas']['Collection']
export type Song = components['schemas']['Song']
export type Setlist = components['schemas']['Setlist']

export class ApiUnauthorizedError extends Error {
  override readonly name = 'ApiUnauthorizedError'
}

const PAGE_SIZE = 50
const ALL_SONGS_PAGE_SIZE = 500

function listErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'title' in body) {
    const t = (body as { title?: string }).title
    if (typeof t === 'string' && t) return t
  }
  return `Request failed (${status})`
}

async function on401(queryClient: QueryClient): Promise<never> {
  await redirectToLoginAfterUnauthorized(queryClient)
  throw new ApiUnauthorizedError()
}

export async function fetchCollectionsPage(
  queryClient: QueryClient,
  args: { page: number; q: string; teamId?: string | null; signal?: AbortSignal },
): Promise<{ items: Collection[]; total: number | undefined }> {
  const team = args.teamId?.trim() || undefined
  const { data, response, error } = await api.GET('/api/v1/collections', {
    params: {
      query: {
        page: args.page,
        page_size: PAGE_SIZE,
        q: args.q.trim() || undefined,
        team,
      },
    },
    signal: args.signal,
  })
  if (response.status === 401) return on401(queryClient)
  if (!response.ok) {
    throw new Error(listErrorMessage(response.status, error))
  }
  return { items: data ?? [], total: parseTotalCount(response) }
}

export async function fetchSetlistsPage(
  queryClient: QueryClient,
  args: { page: number; q: string; teamId?: string | null; signal?: AbortSignal },
): Promise<{ items: Setlist[]; total: number | undefined }> {
  const team = args.teamId?.trim() || undefined
  const { data, response, error } = await api.GET('/api/v1/setlists', {
    params: {
      query: {
        page: args.page,
        page_size: PAGE_SIZE,
        q: args.q.trim() || undefined,
        team,
      },
    },
    signal: args.signal,
  })
  if (response.status === 401) return on401(queryClient)
  if (!response.ok) {
    throw new Error(listErrorMessage(response.status, error))
  }
  return { items: data ?? [], total: parseTotalCount(response) }
}

export async function fetchSongsPage(
  queryClient: QueryClient,
  args: { page: number; q: string; teamId?: string | null; signal?: AbortSignal },
): Promise<{ items: Song[]; total: number | undefined }> {
  const q = args.q.trim()
  const team = args.teamId?.trim() || undefined
  const { data, response, error } = await api.GET('/api/v1/songs', {
    params: {
      query: {
        page: args.page,
        page_size: PAGE_SIZE,
        q: q || undefined,
        team,
        sort: q ? 'relevance' : undefined,
      },
    },
    signal: args.signal,
  })
  if (response.status === 401) return on401(queryClient)
  if (!response.ok) {
    throw new Error(listErrorMessage(response.status, error))
  }
  return { items: data ?? [], total: parseTotalCount(response) }
}

/** Fetch every song visible to the caller, without applying hub search or team filters. */
export async function fetchAllAccessibleSongs(
  queryClient: QueryClient,
  signal?: AbortSignal,
): Promise<Song[]> {
  const songs: Song[] = []
  let page = 0
  let total: number | undefined

  while (true) {
    const { data, response, error } = await api.GET('/api/v1/songs', {
      params: {
        query: {
          page,
          page_size: ALL_SONGS_PAGE_SIZE,
          q: undefined,
          team: undefined,
          sort: 'id',
        },
      },
      signal,
    })
    if (response.status === 401) return on401(queryClient)
    if (!response.ok) {
      throw new Error(listErrorMessage(response.status, error))
    }

    const items = data ?? []
    songs.push(...items)
    total = parseTotalCount(response)

    if (total !== undefined ? songs.length >= total : items.length < ALL_SONGS_PAGE_SIZE) {
      break
    }
    if (items.length === 0) break
    page += 1
  }

  return songs
}
