import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'

import { fetchTeamsPage } from '@/api/teams-sessions-fetch'
import { useHubSearch } from '@/hooks/useHubSearch'
import { useOnline } from '@/hooks/use-online'
import { getNextPageIndex } from '@/lib/list-pagination'
import { teamsListKey } from '@/lib/teams-sessions-keys'

export function useTeamsList() {
  const queryClient = useQueryClient()
  const { debouncedQ } = useHubSearch()
  const q = debouncedQ
  const online = useOnline()
  return useInfiniteQuery({
    queryKey: teamsListKey(q),
    initialPageParam: 0,
    networkMode: 'always',
    staleTime: online ? 0 : Number.POSITIVE_INFINITY,
    refetchOnReconnect: online,
    queryFn: async ({ pageParam, signal }) => {
      const page = pageParam as number
      return fetchTeamsPage(queryClient, { page, q, signal })
    },
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })
}
