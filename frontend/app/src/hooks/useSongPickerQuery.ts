import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { api } from '@/api/client'
import type { components } from '@/api/schema'

import { redirectToLoginAfterUnauthorized } from '@/lib/api-unauthorized'
import { parseTotalCount } from '@/lib/list-pagination'

export type Song = components['schemas']['Song']

async function fetchSongsPickPage(
  queryClient: QueryClient,
  args: { q: string; signal?: AbortSignal },
): Promise<{ items: Song[]; total: number | undefined }> {
  const q = args.q.trim()
  const { data, response, error } = await api.GET('/api/v1/songs', {
    params: {
      query: {
        page: 0,
        page_size: 50,
        q: q || undefined,
        sort: q ? 'relevance' : '-id',
      },
    },
    signal: args.signal,
  })
  if (response.status === 401) {
    await redirectToLoginAfterUnauthorized(queryClient)
    throw new Error('Unauthorized')
  }
  if (!response.ok) throw new Error(String((error as { title?: string } | undefined)?.title ?? 'Fetch failed'))
  const items = (data ?? []).filter((s) => !s.not_a_song)
  return { items, total: parseTotalCount(response) }
}

export function useDebounced(ms: number, raw: string) {
  const [debounced, setDebounced] = useState(raw)
  useEffect(() => {
    const t = globalThis.setTimeout(() => setDebounced(raw), ms)
    return () => globalThis.clearTimeout(t)
  }, [ms, raw])
  return debounced
}

/** Shared song search for picker + Cmd‑K (300ms debounced + AbortController via React Query signal). */
export function useSongPickerQuery(qRaw: string) {
  const queryClient = useQueryClient()
  const qDebounced = useDebounced(300, qRaw)
  return useQuery({
    queryKey: ['songPickerResults', qDebounced],
    queryFn: ({ signal }) => fetchSongsPickPage(queryClient, { q: qDebounced, signal }),
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  })
}
