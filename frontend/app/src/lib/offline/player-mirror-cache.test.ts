import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayerMirrorRow } from '@/lib/dexie-db'
import { MAX_CACHED_PLAYERS } from '@/lib/offline/player-mirror-constants'

const mirrorStore = new Map<string, PlayerMirrorRow>()

function makeMirror(id: string, openedAt: number): PlayerMirrorRow {
  return {
    id,
    entityType: 'setlist',
    entityId: id.replace('setlist:', ''),
    playerJson: '{"items":[]}',
    lastOpenedAt: openedAt,
  }
}

vi.mock('@/lib/dexie-db', () => ({
  playerMirrorId: (type: string, entityId: string) => `${type}:${entityId}`,
  appDb: {
    playerMirror: {
      get: async (id: string) => mirrorStore.get(id),
      delete: async (id: string) => {
        mirrorStore.delete(id)
      },
      put: async (row: PlayerMirrorRow) => {
        mirrorStore.set(row.id, row)
      },
      toArray: async () => [...mirrorStore.values()],
      orderBy: () => ({
        toArray: async () =>
          [...mirrorStore.values()].sort((a, b) => a.lastOpenedAt - b.lastOpenedAt),
        first: async () =>
          [...mirrorStore.values()].sort((a, b) => a.lastOpenedAt - b.lastOpenedAt)[0],
      }),
      each: async (fn: (row: PlayerMirrorRow) => void) => {
        for (const row of mirrorStore.values()) fn(row)
      },
    },
    kv: {
      each: async () => {},
    },
    transaction: async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => {
      await fn()
    },
  },
}))

import { enforceOfflineRetention, evictOnePlayerMirror } from '@/lib/offline/player-mirror-cache'

describe('player-mirror-cache retention', () => {
  beforeEach(() => {
    mirrorStore.clear()
  })

  it('evictOnePlayerMirror removes mirror row', async () => {
    mirrorStore.set('setlist:a', makeMirror('setlist:a', 1))
    await evictOnePlayerMirror('setlist:a')
    expect(mirrorStore.has('setlist:a')).toBe(false)
  })

  it('enforceOfflineRetention evicts LRU when over MAX_CACHED_PLAYERS', async () => {
    for (let i = 0; i < MAX_CACHED_PLAYERS + 2; i++) {
      mirrorStore.set(`setlist:s${i}`, makeMirror(`setlist:s${i}`, i))
    }
    await enforceOfflineRetention('setlist:s-new')
    expect(mirrorStore.size).toBeLessThanOrEqual(MAX_CACHED_PLAYERS)
    expect(mirrorStore.has('setlist:s-new') || mirrorStore.size === MAX_CACHED_PLAYERS).toBe(true)
  })
})
