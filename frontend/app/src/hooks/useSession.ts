import { useQuery } from '@tanstack/react-query'

import { fetchSessionUser, SESSION_QUERY_KEY, SESSION_STALE_TIME_MS } from '@/api/session'

export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSessionUser,
    staleTime: SESSION_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    networkMode: 'always',
  })
}
