import { useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchCollectionDetail } from '@/api/collections-detail'
import { collectionDetailKey } from '@/lib/setlist-detail-key'

export function useCollectionDetailQuery(collectionId: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: collectionDetailKey(collectionId),
    queryFn: ({ signal }) => fetchCollectionDetail(queryClient, { id: collectionId, signal }),
    enabled: Boolean(collectionId),
  })
}

export { fetchCollectionDetail } from '@/api/collections-detail'
export type { Collection } from '@/api/collections-detail'
