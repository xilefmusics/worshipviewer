import type { QueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import type { components } from '@/api/schema'

import { redirectToLoginAfterUnauthorized } from '@/lib/api-unauthorized'

export type Collection = components['schemas']['Collection']

function problemTitle(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'title' in body) {
    const t = (body as { title?: string }).title
    if (typeof t === 'string' && t) return t
  }
  return `Request failed (${status})`
}

export async function fetchCollectionDetail(
  queryClient: QueryClient,
  args: { id: string; signal?: AbortSignal },
): Promise<Collection> {
  const { data, response, error } = await api.GET('/api/v1/collections/{id}', {
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
