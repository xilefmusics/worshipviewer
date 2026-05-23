import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'

import { fetchTeamsPage } from '@/api/teams-sessions-fetch'
import { useHubSearch } from '@/hooks/useHubSearch'
import { getNextPageIndex } from '@/lib/list-pagination'
import { teamsListKey } from '@/lib/teams-sessions-keys'

export function useTeamsList() {
  const queryClient = useQueryClient()
  const { debouncedQ } = useHubSearch()
  const q = debouncedQ
  return useInfiniteQuery({
    queryKey: teamsListKey(q),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const page = pageParam as number
      return fetchTeamsPage(queryClient, { page, q, signal })
    },
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })
}
