import { describe, expect, it, vi, beforeEach } from 'vitest'

import { reconcileSetlistPlayer404 } from '@/lib/player/server-deleted-reconciliation'

vi.mock('@/lib/offline/setlist-player-cache', () => ({
  evictOneSetlistMirror: vi.fn(async () => undefined),
}))

vi.mock('@/lib/dexie-db', () => ({
  appDb: {
    setlistPlayerMirror: {
      get: vi.fn(),
    },
  },
}))

import { evictOneSetlistMirror } from '@/lib/offline/setlist-player-cache'
import { appDb } from '@/lib/dexie-db'

describe('reconcileSetlistPlayer404', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('evicts mirror and emits event on 404 with cached player', async () => {
    const player = { index: 0, items: [], toc: [], between_items: true, orientation: 'portrait', scroll_type: 'one_page', scroll_type_cache_other_orientation: 'one_page' }
    vi.mocked(appDb.setlistPlayerMirror.get).mockResolvedValue({
      setlistId: 's1',
      playerJson: JSON.stringify(player),
      blobIds: [],
      lastOpenedAt: 1,
    })

    const listener = vi.fn()
    const addEventListener = vi.fn((_event: string, cb: EventListener) => {
      listener.mockImplementation(cb as () => void)
    })
    vi.stubGlobal('window', {
      addEventListener,
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn((event: Event) => {
        listener(event)
        return true
      }),
    })

    const result = await reconcileSetlistPlayer404('s1', 404)

    expect(result.kind).toBe('reconciled')
    expect(evictOneSetlistMirror).toHaveBeenCalledWith('s1')
    expect(globalThis.window.dispatchEvent).toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it('returns none for non-404', async () => {
    const result = await reconcileSetlistPlayer404('s1', 500)
    expect(result.kind).toBe('none')
  })
})
