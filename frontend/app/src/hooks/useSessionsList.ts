import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'

import { fetchSessionsPage } from '@/api/teams-sessions-fetch'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useOnline } from '@/hooks/use-online'
import { getNextPageIndex } from '@/lib/list-pagination'
import { sessionsListKey } from '@/lib/teams-sessions-keys'

export function useSessionsList() {
  const queryClient = useQueryClient()
  const { debouncedQ } = useHubSearch()
  const q = debouncedQ
  const online = useOnline()
  return useInfiniteQuery({
    queryKey: sessionsListKey(q),
    initialPageParam: 0,
    networkMode: 'always',
    staleTime: online ? 0 : Number.POSITIVE_INFINITY,
    refetchOnReconnect: online,
    queryFn: async ({ pageParam, signal }) => {
      const page = pageParam as number
      return fetchSessionsPage(queryClient, { page, q, signal })
    },
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })
}
