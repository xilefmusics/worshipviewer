import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'

import { fetchSessionsPage } from '@/api/teams-sessions-fetch'
import { useHubSearch } from '@/hooks/useHubSearch'
import { getNextPageIndex } from '@/lib/list-pagination'
import { sessionsListKey } from '@/lib/teams-sessions-keys'

export function useSessionsList() {
  const queryClient = useQueryClient()
  const { debouncedQ } = useHubSearch()
  const q = debouncedQ
  return useInfiniteQuery({
    queryKey: sessionsListKey(q),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const page = pageParam as number
      return fetchSessionsPage(queryClient, { page, q, signal })
    },
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })
}
