import { describe, expect, it } from 'vitest'

import {
  readPlayerViewState,
  writePlayerViewState,
  playerViewStorageKey,
} from '@/lib/player/player-view-state'

describe('player-view-state', () => {
  it('uses stable storage keys', () => {
    expect(playerViewStorageKey('setlist', 'abc')).toBe('playerView:setlist:abc')
  })

  it('persists and reads transpose settings', () => {
    const storage = new Map<string, string>()
    const mockStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v)
      },
    }

    writePlayerViewState('song', 's1', { transposeByItem: { 0: 'G' } }, mockStorage)

    const loaded = readPlayerViewState('song', 's1', mockStorage)
    expect(loaded.transposeByItem[0]).toBe('G')
  })
})
