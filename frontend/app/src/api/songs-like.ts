import type { QueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'

import { redirectToLoginAfterUnauthorized } from '@/lib/api-unauthorized'

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
}
