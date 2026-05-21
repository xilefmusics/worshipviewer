import { useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchSongDetail } from '@/api/songs-detail'
import { songDetailQueryKey } from '@/lib/setlist-detail-key'

export function useSongDetailQuery(songId: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: songDetailQueryKey(songId),
    queryFn: ({ signal }) => fetchSongDetail(queryClient, { id: songId, signal }),
    enabled: Boolean(songId),
  })
}

export { fetchSongDetail } from '@/api/songs-detail'
export type { Song } from '@/api/songs-detail'
