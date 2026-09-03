import type { QueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { problemMessageFromBody } from '@/api/problem'
import type { components } from '@/api/schema'
import { clearAllLocalData } from '@/lib/clear-local'

export type ImpersonationStatus = components['schemas']['ImpersonationStatus']

export const IMPERSONATION_QUERY_KEY = ['impersonation', 'current'] as const

export async function fetchImpersonationStatus(): Promise<ImpersonationStatus> {
  const { data, error, response } = await api.GET('/auth/impersonation/current', {})
  if (!response.ok || data == null) {
    throw new Error(problemMessageFromBody(error, 'Could not load impersonation status.'))
  }
  return data
}

export async function startImpersonation(userId: string): Promise<ImpersonationStatus> {
  const { data, error, response } = await api.POST('/api/v1/users/{user_id}/impersonation', {
    params: { path: { user_id: userId } },
  })
  if (!response.ok || data == null) {
    throw new Error(problemMessageFromBody(error, 'Could not start impersonation.'))
  }
  return data
}

export async function stopImpersonation(queryClient: QueryClient): Promise<void> {
  const { error, response } = await api.POST('/auth/impersonation/stop', {})
  if (!response.ok && response.status !== 204) {
    throw new Error(problemMessageFromBody(error, 'Could not stop impersonation.'))
  }
  await clearAllLocalData(queryClient)
}
