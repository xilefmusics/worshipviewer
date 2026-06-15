import type { InfiniteData, InfiniteQueryObserverResult, NotifyOnChangeProps } from '@tanstack/query-core'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchCollectionsPage,
  fetchSetlistsPage,
  fetchSongsPage,
} from '@/api/list-fetch'
import { useHubSearch } from '@/hooks/useHubSearch'
import type { HubEntity } from '@/lib/hub-entity'
import { hubListKey } from '@/lib/hub-list-keys'
import { useOnline } from '@/hooks/use-online'
import { getNextPageIndex } from '@/lib/list-pagination'

/** Only subscribe to result fields the hub list needs — avoids re-renders on background refetch / fetchStatus churn. */
const hubListNotifyOnChangeProps = [
  'data',
  'error',
  'isPending',
  'isLoading',
  'isError',
  'status',
  'isFetchingNextPage',
  'isFetchNextPageError',
  'hasNextPage',
  'fetchNextPage',
  'refetch',
] as const satisfies ReadonlyArray<keyof InfiniteQueryObserverResult<InfiniteData<unknown>>>

const hubListNotify: NotifyOnChangeProps = hubListNotifyOnChangeProps as unknown as NotifyOnChangeProps

export function useInfiniteHubList(entity: HubEntity) {
  const { debouncedQ, selectedTeamId } = useHubSearch()
  const queryClient = useQueryClient()
  const q = debouncedQ
  const online = useOnline()

  return useInfiniteQuery({
    queryKey: hubListKey(entity, q, selectedTeamId),
    initialPageParam: 0,
    notifyOnChangeProps: hubListNotify,
    /** Fresh after restore: refetch when online; snapshots never expire on disk. */
    staleTime: online ? 0 : Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    networkMode: 'always',
    refetchOnReconnect: online,
    queryFn: async ({ pageParam, signal }) => {
      const page = pageParam as number
      switch (entity) {
        case 'collections':
          return fetchCollectionsPage(queryClient, { page, q, teamId: selectedTeamId, signal })
        case 'songs':
          return fetchSongsPage(queryClient, { page, q, teamId: selectedTeamId, signal })
        case 'setlists':
          return fetchSetlistsPage(queryClient, { page, q, teamId: selectedTeamId, signal })
      }
    },
    getNextPageParam: (_last, allPages) => getNextPageIndex(allPages),
  })
}
