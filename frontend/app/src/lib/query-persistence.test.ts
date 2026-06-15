import { beforeEach, describe, expect, it, vi } from 'vitest'

const { kv } = vi.hoisted(() => ({
  kv: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/lib/dexie-db', () => ({
  appDb: { kv },
}))

import {
  createHubListsQueryPersister,
  readHubListsUpdatedAt,
} from '@/lib/query-persistence'

describe('query persistence', () => {
  beforeEach(() => {
    kv.get.mockReset()
    kv.put.mockReset()
    kv.delete.mockReset()
  })

  it('returns null when Dexie reads reject', async () => {
    kv.get.mockRejectedValue(new Error('indexeddb unavailable'))

    await expect(readHubListsUpdatedAt()).resolves.toBeNull()
  })

  it('continues when Dexie writes and deletes reject', async () => {
    kv.put.mockRejectedValue(new Error('indexeddb unavailable'))
    kv.delete.mockRejectedValue(new Error('indexeddb unavailable'))

    const persister = createHubListsQueryPersister()
    await expect(
      persister.persistClient({
        buster: 'test',
        timestamp: Date.now(),
        clientState: { mutations: [], queries: [] },
      }),
    ).resolves.toBeUndefined()
    await expect(persister.removeClient()).resolves.toBeUndefined()
  })
})
