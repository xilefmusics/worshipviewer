import { useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchCurrentSession } from '@/api/teams-sessions-fetch'
import { sessionsCurrentCredentialKey } from '@/lib/teams-sessions-keys'

/** Resolves the session row for this browser via `/api/v1/users/me/sessions/current` when cookies are HttpOnly. */
export function useCurrentSessionCredential() {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: sessionsCurrentCredentialKey,
    queryFn: ({ signal }) => fetchCurrentSession(queryClient, { signal }),
    staleTime: 60_000,
  })
}
