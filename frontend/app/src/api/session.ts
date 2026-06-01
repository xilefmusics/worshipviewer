import type { components } from './schema'
import { api } from '@/api/client'
import { isNetworkError, persistSessionUser, readCachedSessionUser } from '@/lib/session-cache'

export type User = components['schemas']['User']

export const SESSION_STALE_TIME_MS = 15 * 60 * 1000

export const SESSION_QUERY_KEY = ['session', 'me'] as const

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

async function fetchSessionUserFromNetwork(): Promise<User | null> {
  const { data, response, error } = await api.GET('/api/v1/users/me', {})
  if (response.status === 401) return null
  if (!response.ok) {
    const msg = error ? JSON.stringify(error) : response.statusText
    throw new Error(msg || 'Session request failed')
  }
  return data ?? null
}

/** Session user from network when online; falls back to Dexie cache on network failure. */
export async function fetchSessionUser(): Promise<User | null> {
  if (isOffline()) {
    const cached = await readCachedSessionUser()
    if (cached) return cached
  }

  try {
    const user = await fetchSessionUserFromNetwork()
    if (user) {
      await persistSessionUser(user)
      return user
    }
    return null
  } catch (e) {
    if (isNetworkError(e) || isOffline()) {
      const cached = await readCachedSessionUser()
      if (cached) return cached
    }
    throw e
  }
}
