import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { fetchSessionMetrics, type HttpAuditMetrics } from '@/api/teams-sessions-fetch'
import { sessionMetricsKey } from '@/lib/teams-sessions-keys'

const SESSION_METRICS_STALE_MS = 45_000

export type SessionMetricSlot = {
  metrics: HttpAuditMetrics | null | undefined
  isPending: boolean
  isError: boolean
  errorMessage?: string
}

export function useSessionsMetrics(sessionIds: readonly string[]) {
  const queryClient = useQueryClient()

  const uniqueIds = useMemo(() => [...new Set(sessionIds)], [sessionIds])

  const results = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: sessionMetricsKey(id),
      queryFn: ({ signal }) => fetchSessionMetrics(queryClient, { id, signal }),
      staleTime: SESSION_METRICS_STALE_MS,
    })),
  })

  const bySessionId = useMemo(() => {
    const out: Record<string, SessionMetricSlot> = {}
    uniqueIds.forEach((id, i) => {
      const q = results[i]
      if (!q) return
      out[id] = {
        metrics: q.data,
        isPending: q.isPending,
        isError: q.isError,
        errorMessage: q.error instanceof Error ? q.error.message : undefined,
      }
    })
    return out
  }, [uniqueIds, results])

  return bySessionId
}
