import { redirect } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

import { fetchSessionUser, SESSION_QUERY_KEY, SESSION_STALE_TIME_MS } from '@/api/session'
import { clearAllLocalData } from '@/lib/clear-local'

function currentPathWithQuery(): string {
  if (typeof globalThis.window === 'undefined') return '/'
  const { pathname, search } = globalThis.window.location
  return pathname + search
}

/** Protected routes: session required or redirect to `/login` with `return_to`. */
export async function requireSession(context: { queryClient: QueryClient }): Promise<void> {
  const pathWithQuery = currentPathWithQuery()

  const user = await context.queryClient.ensureQueryData({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSessionUser,
    staleTime: SESSION_STALE_TIME_MS,
  })

  if (!user) {
    await clearAllLocalData(context.queryClient)
    throw redirect({
      to: '/login',
      search: { return_to: pathWithQuery || '/' },
    })
  }
}
