import type { User } from '@/api/session'
import { appDb } from '@/lib/dexie-db'

export const SESSION_KV_KEY = 'session-user-v1'

function isUserShape(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false
  const u = value as Record<string, unknown>
  return typeof u.id === 'string' && typeof u.email === 'string'
}

export async function persistSessionUser(user: User): Promise<void> {
  await appDb.kv.put({ key: SESSION_KV_KEY, value: JSON.stringify(user) })
}

export async function readCachedSessionUser(): Promise<User | null> {
  const row = await appDb.kv.get(SESSION_KV_KEY)
  if (!row?.value) return null
  try {
    const parsed: unknown = JSON.parse(row.value)
    return isUserShape(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network request failed') ||
      msg.includes('load failed')
    )
  }
  return false
}
