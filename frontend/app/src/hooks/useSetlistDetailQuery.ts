import { useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchSetlistDetail } from '@/api/setlists-detail'
import { setlistDetailKey } from '@/lib/setlist-detail-key'

export function useSetlistDetailQuery(setlistId: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: setlistDetailKey(setlistId),
    queryFn: ({ signal }) => fetchSetlistDetail(queryClient, { id: setlistId, signal }),
    enabled: Boolean(setlistId),
  })
}

export { fetchSetlistDetail } from '@/api/setlists-detail'
export type { Setlist } from '@/api/setlists-detail'
