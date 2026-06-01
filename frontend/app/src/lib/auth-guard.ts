import { redirect } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

import {
  fetchSessionUser,
  SESSION_QUERY_KEY,
  SESSION_STALE_TIME_MS,
} from '@/api/session'
import { clearAllLocalData } from '@/lib/clear-local'
import { isNetworkError, readCachedSessionUser } from '@/lib/session-cache'

function currentPathWithQuery(): string {
  if (typeof globalThis.window === 'undefined') return '/'
  const { pathname, search } = globalThis.window.location
  return pathname + search
}

async function resolveSessionUser(queryClient: QueryClient) {
  try {
    return await queryClient.fetchQuery({
      queryKey: SESSION_QUERY_KEY,
      queryFn: fetchSessionUser,
      staleTime: SESSION_STALE_TIME_MS,
      networkMode: 'always',
    })
  } catch (e) {
    if (isNetworkError(e) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      const cached = await readCachedSessionUser()
      if (cached) {
        queryClient.setQueryData(SESSION_QUERY_KEY, cached)
        return cached
      }
    }
    throw e
  }
}

/** Protected routes: session required or redirect to `/login` with `return_to`. */
export async function requireSession(context: { queryClient: QueryClient }): Promise<void> {
  const pathWithQuery = currentPathWithQuery()

  const user = await resolveSessionUser(context.queryClient)

  if (!user) {
    await clearAllLocalData(context.queryClient)
    throw redirect({
      to: '/login',
      search: { return_to: pathWithQuery || '/' },
    })
  }
}
