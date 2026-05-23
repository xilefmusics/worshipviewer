import type { components } from './schema'
import { api } from '@/api/client'

export type User = components['schemas']['User']

export const SESSION_STALE_TIME_MS = 15 * 60 * 1000

export const SESSION_QUERY_KEY = ['session', 'me'] as const

export async function fetchSessionUser(): Promise<User | null> {
  const { data, response, error } = await api.GET('/api/v1/users/me', {})
  if (response.status === 401) return null
  if (!response.ok) {
    const msg = error ? JSON.stringify(error) : response.statusText
    throw new Error(msg || 'Session request failed')
  }
  return data ?? null
}
