import { beforeEach, describe, expect, it, vi } from 'vitest'

const kvStore = new Map<string, string>()

vi.mock('@/lib/dexie-db', () => ({
  appDb: {
    kv: {
      put: vi.fn(async ({ key, value }: { key: string; value: string }) => {
        kvStore.set(key, value)
      }),
      get: vi.fn(async (key: string) => {
        const value = kvStore.get(key)
        return value !== undefined ? { key, value } : undefined
      }),
      clear: vi.fn(async () => {
        kvStore.clear()
      }),
    },
  },
}))

import {
  persistSessionUser,
  readCachedSessionUser,
  isNetworkError,
} from '@/lib/session-cache'

describe('session-cache', () => {
  beforeEach(() => {
    kvStore.clear()
  })

  it('persists and reads a session user', async () => {
    const user = {
      id: 'u1',
      email: 'a@b.c',
      created_at: '2020-01-01T00:00:00Z',
      role: 'default' as const,
    }
    await persistSessionUser(user)
    const cached = await readCachedSessionUser()
    expect(cached).toEqual(user)
  })

  it('returns null for invalid cached JSON', async () => {
    kvStore.set('session-user-v1', '{bad')
    expect(await readCachedSessionUser()).toBeNull()
  })

  it('returns null for invalid user shape', async () => {
    kvStore.set('session-user-v1', JSON.stringify({ foo: 1 }))
    expect(await readCachedSessionUser()).toBeNull()
  })

  it('detects network errors', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('Network request failed'))).toBe(true)
    expect(isNetworkError(new Error('Unauthorized'))).toBe(false)
  })
})
