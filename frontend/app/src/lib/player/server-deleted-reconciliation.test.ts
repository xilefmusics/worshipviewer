import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/offline/player-mirror-cache', () => ({
  evictOnePlayerMirror: vi.fn(),
}))

vi.mock('@/lib/dexie-db', () => ({
  playerMirrorId: (type: string, id: string) => `${type}:${id}`,
  appDb: {
    playerMirror: {
      get: vi.fn(),
    },
  },
}))

import { appDb } from '@/lib/dexie-db'
import { evictOnePlayerMirror } from '@/lib/offline/player-mirror-cache'
import { reconcilePlayer404 } from '@/lib/player/server-deleted-reconciliation'

describe('reconcilePlayer404', () => {
  beforeEach(() => {
    vi.mocked(evictOnePlayerMirror).mockClear()
    vi.mocked(appDb.playerMirror.get).mockReset()
  })

  it('returns none for non-404', async () => {
    expect(await reconcilePlayer404('setlist', 's1', 500)).toEqual({ kind: 'none' })
  })

  it('reconciles 404 with cached mirror', async () => {
    vi.mocked(appDb.playerMirror.get).mockResolvedValue({
      id: 'setlist:s1',
      entityType: 'setlist',
      entityId: 's1',
      playerJson: JSON.stringify({ items: [] }),
      blobIds: [],
      lastOpenedAt: 1,
    })
    const res = await reconcilePlayer404('setlist', 's1', 404)
    expect(res.kind).toBe('reconciled')
    expect(evictOnePlayerMirror).toHaveBeenCalledWith('setlist:s1')
  })
})
