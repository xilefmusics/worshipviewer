import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchTeamDetail, fetchTeamInvitationsPage } from '@/api/teams-sessions-fetch'
import { getNextPageIndex } from '@/lib/list-pagination'
import { teamDetailKey, teamInvitationsKey } from '@/lib/teams-sessions-keys'

export function useTeamDetail(teamId: string, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient()
  const enabled = options?.enabled !== false
  return useQuery({
    queryKey: teamDetailKey(teamId),
    enabled: Boolean(teamId) && enabled,
    queryFn: ({ signal }) => fetchTeamDetail(queryClient, { id: teamId, signal }),
  })
}

export function useTeamInvitationsList(teamId: string, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient()
  const enabled = options?.enabled !== false
  return useInfiniteQuery({
    queryKey: teamInvitationsKey(teamId),
    initialPageParam: 0,
    enabled: Boolean(teamId) && enabled,
    queryFn: async ({ pageParam, signal }) => {
      const page = pageParam as number
      return fetchTeamInvitationsPage(queryClient, { teamId, page, signal })
    },
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })
}
