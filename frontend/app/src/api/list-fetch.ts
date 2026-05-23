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
  args: { page: number; q: string; signal?: AbortSignal },
): Promise<{ items: Collection[]; total: number | undefined }> {
  const { data, response, error } = await api.GET('/api/v1/collections', {
    params: {
      query: {
        page: args.page,
        page_size: PAGE_SIZE,
        q: args.q.trim() || undefined,
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
  args: { page: number; q: string; signal?: AbortSignal },
): Promise<{ items: Setlist[]; total: number | undefined }> {
  const { data, response, error } = await api.GET('/api/v1/setlists', {
    params: {
      query: {
        page: args.page,
        page_size: PAGE_SIZE,
        q: args.q.trim() || undefined,
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
  args: { page: number; q: string; signal?: AbortSignal },
): Promise<{ items: Song[]; total: number | undefined }> {
  const q = args.q.trim()
  const { data, response, error } = await api.GET('/api/v1/songs', {
    params: {
      query: {
        page: args.page,
        page_size: PAGE_SIZE,
        q: q || undefined,
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
