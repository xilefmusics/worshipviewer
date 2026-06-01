import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchPlayerFromNetwork = vi.fn()
const persistPlayerMirror = vi.fn()
const isPlayerMirrored = vi.fn()
const removePlayerMirror = vi.fn()

vi.mock('@/lib/offline/player-mirror-cache', () => ({
  fetchPlayerFromNetwork: (...args: unknown[]) => fetchPlayerFromNetwork(...args),
  persistPlayerMirror: (...args: unknown[]) => persistPlayerMirror(...args),
  isPlayerMirrored: (...args: unknown[]) => isPlayerMirrored(...args),
  removePlayerMirror: (...args: unknown[]) => removePlayerMirror(...args),
}))

import {
  downloadPlayerForOffline,
  removeOfflinePlayerCopy,
} from '@/lib/offline/download-player-offline'

describe('downloadPlayerForOffline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('navigator', { onLine: true })
  })

  it('returns offline when navigator is offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const res = await downloadPlayerForOffline('setlist', 'sl-1')
    expect(res).toEqual({ error: 'offline' })
  })

  it('mirrors player after successful network fetch', async () => {
    fetchPlayerFromNetwork.mockResolvedValue({ player: { items: [] } })
    persistPlayerMirror.mockResolvedValue(undefined)

    const res = await downloadPlayerForOffline('setlist', 'sl-1', { title: 'My setlist' })
    expect(res).toEqual({ ok: true, evicted: false })
    expect(persistPlayerMirror).toHaveBeenCalledWith('setlist', 'sl-1', { items: [] }, {
      signal: undefined,
      title: 'My setlist',
    })
  })

  it('returns network error when fetch fails', async () => {
    fetchPlayerFromNetwork.mockResolvedValue({ error: 'Not found', status: 404 })
    const res = await downloadPlayerForOffline('collection', 'c-1')
    expect(res).toEqual({ error: 'network', message: 'Not found' })
  })

  it('returns empty when player payload missing', async () => {
    fetchPlayerFromNetwork.mockResolvedValue({ player: null })
    const res = await downloadPlayerForOffline('song', 's-1')
    expect(res).toEqual({ error: 'empty' })
  })
})

describe('removeOfflinePlayerCopy', () => {
  it('delegates to removePlayerMirror', async () => {
    removePlayerMirror.mockResolvedValue(undefined)
    await removeOfflinePlayerCopy('setlist', 'sl-9')
    expect(removePlayerMirror).toHaveBeenCalledWith('setlist', 'sl-9')
  })
})
