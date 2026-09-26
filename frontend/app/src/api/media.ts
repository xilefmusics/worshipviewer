import type { QueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { problemMessageFromBody } from '@/api/problem'
import type { components } from '@/api/schema'
import { redirectToLoginAfterUnauthorized } from '@/lib/api-unauthorized'
import { parseTotalCount } from '@/lib/list-pagination'

export type Media = components['schemas']['Media']
export type MediaContent = components['schemas']['MediaContent']
export type CreateMediaContent = components['schemas']['CreateMediaContent']
export type CreateMedia = components['schemas']['CreateMedia']
export type UpdateMedia = components['schemas']['UpdateMedia']

export const mediaListRootKey = ['media'] as const
export const mediaDetailKey = (id: string) => [...mediaListRootKey, 'detail', id] as const
export const mediaListKey = (q: string, teamId?: string | null, isBackground?: boolean) =>
  [...mediaListRootKey, 'list', q, teamId ?? null, isBackground ?? null] as const

const PAGE_SIZE = 50

async function requireOk<T>(
  queryClient: QueryClient,
  result: { data?: T; error?: unknown; response: Response },
  fallback: string,
): Promise<T> {
  if (result.response.status === 401) {
    await redirectToLoginAfterUnauthorized(queryClient)
    throw new Error(fallback)
  }
  if (!result.response.ok || result.data == null) {
    throw new Error(problemMessageFromBody(result.error, fallback))
  }
  return result.data
}

export async function fetchMediaPage(
  queryClient: QueryClient,
  args: { page: number; q: string; teamId?: string | null; isBackground?: boolean; signal?: AbortSignal },
): Promise<{ items: Media[]; total: number | undefined }> {
  const result = await api.GET('/api/v1/media', {
    params: {
      query: {
        page: args.page,
        page_size: PAGE_SIZE,
        q: args.q.trim() || undefined,
        team: args.teamId?.trim() || undefined,
        is_background: args.isBackground,
      },
    },
    signal: args.signal,
  })
  const items = await requireOk(queryClient, result, 'Could not load media.')
  return { items, total: parseTotalCount(result.response) }
}

export async function fetchMedia(queryClient: QueryClient, id: string, signal?: AbortSignal) {
  const result = await api.GET('/api/v1/media/{id}', {
    params: { path: { id } },
    signal,
  })
  return requireOk(queryClient, result, 'Could not load media.')
}

export async function createMedia(queryClient: QueryClient, body: CreateMedia) {
  const result = await api.POST('/api/v1/media', { body })
  return requireOk(queryClient, result, 'Could not create media.')
}

export async function updateMedia(queryClient: QueryClient, id: string, body: UpdateMedia) {
  const result = await api.PUT('/api/v1/media/{id}', {
    params: { path: { id } },
    body,
  })
  return requireOk(queryClient, result, 'Could not save media.')
}

export async function beginDeckRevision(queryClient: QueryClient, id: string) {
  const result = await api.POST('/api/v1/media/{id}/deck/revisions', {
    params: { path: { id } },
  })
  return requireOk(queryClient, result, 'Could not start deck editing.')
}

export async function commitDeck(
  queryClient: QueryClient,
  id: string,
  body: {
    revision_id: string
    page_ids: string[]
    section_titles?: Array<string | null>
  },
) {
  const result = await api.POST('/api/v1/media/{id}/deck/commit', {
    params: { path: { id } },
    body,
  })
  return requireOk(queryClient, result, 'Could not save the slide deck.')
}

export async function moveMedia(queryClient: QueryClient, id: string, owner: string) {
  const result = await api.POST('/api/v1/media/{id}/move', {
    params: { path: { id } },
    body: { owner },
  })
  return requireOk(queryClient, result, 'Could not move media.')
}

export async function duplicateMedia(queryClient: QueryClient, id: string, title: string) {
  const result = await api.POST('/api/v1/media/{id}/duplicate', {
    params: { path: { id } },
    body: { title },
  })
  return requireOk(queryClient, result, 'Could not duplicate media.')
}

export async function deleteMedia(queryClient: QueryClient, id: string) {
  const result = await api.DELETE('/api/v1/media/{id}', { params: { path: { id } } })
  if (result.response.status === 401) {
    await redirectToLoginAfterUnauthorized(queryClient)
  }
  if (!result.response.ok) {
    throw new Error(problemMessageFromBody(result.error, 'Could not delete media.'))
  }
}
