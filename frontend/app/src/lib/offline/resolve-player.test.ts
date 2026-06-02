import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadOfflinePlayer = vi.fn()
const fetchPlayerFromNetwork = vi.fn()
const persistPlayerMirror = vi.fn()

vi.mock('@/lib/offline/player-mirror-cache', () => ({
  fetchPlayerFromNetwork: (...args: unknown[]) => fetchPlayerFromNetwork(...args),
  loadOfflinePlayer: (...args: unknown[]) => loadOfflinePlayer(...args),
  persistPlayerMirror: (...args: unknown[]) => persistPlayerMirror(...args),
}))

vi.mock('@/lib/player/server-deleted-reconciliation', () => ({
  reconcilePlayer404: vi.fn(async () => ({ kind: 'none' })),
}))

import { resolvePlayerForRoute } from '@/lib/offline/resolve-player'

describe('resolvePlayerForRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('navigator', { onLine: true })
  })

  it('returns offline_unavailable for collection when offline and not cached', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    loadOfflinePlayer.mockResolvedValue(null)

    const res = await resolvePlayerForRoute('collection', 'c1')
    expect(res).toEqual({
      status: 'offline_unavailable',
      message: 'offlinePlayer.collectionNotCached',
    })
  })

  it('returns ready from offline cache for setlist', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    loadOfflinePlayer.mockResolvedValue({ items: [] })

    const res = await resolvePlayerForRoute('setlist', 's1')
    expect(res.status).toBe('ready')
    if (res.status === 'ready') {
      expect(res.source).toBe('offline')
    }
  })

  it('persists mirror after online fetch', async () => {
    fetchPlayerFromNetwork.mockResolvedValue({ player: { items: [] } })
    persistPlayerMirror.mockResolvedValue(undefined)

    const res = await resolvePlayerForRoute('song', 'song1')
    expect(persistPlayerMirror).toHaveBeenCalledWith('song', 'song1', { items: [] })
    expect(res.status).toBe('ready')
  })
})
