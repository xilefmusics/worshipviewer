import { describe, expect, it } from 'vitest'

import {
  readPlayerViewState,
  toggleOrientationViewState,
  writePlayerViewState,
  playerViewStorageKey,
} from '@/lib/player/player-view-state'

describe('player-view-state', () => {
  const defaults = {
    scrollType: 'book' as const,
    orientation: 'portrait' as const,
    scrollTypeCacheOtherOrientation: 'half_page' as const,
  }

  it('uses stable storage keys', () => {
    expect(playerViewStorageKey('setlist', 'abc')).toBe('playerView:setlist:abc')
  })

  it('persists and reads transpose + scroll settings', () => {
    const storage = new Map<string, string>()
    const mockStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v)
      },
    }

    writePlayerViewState(
      'song',
      's1',
      { ...defaults, transposeByItem: { 0: 'G' } },
      mockStorage,
    )

    const loaded = readPlayerViewState('song', 's1', defaults, mockStorage)
    expect(loaded.transposeByItem[0]).toBe('G')
    expect(loaded.scrollType).toBe('book')
  })

  it('round-trips orientation scroll cache', () => {
    const state = readPlayerViewState('setlist', 'x', defaults)
    const toggled = toggleOrientationViewState(state)
    expect(toggled.orientation).toBe('landscape')
    expect(toggled.scrollType).toBe('half_page')
    expect(toggled.scrollTypeCacheOtherOrientation).toBe('book')

    const restored = toggleOrientationViewState(toggled)
    expect(restored.scrollType).toBe('book')
    expect(restored.orientation).toBe('portrait')
  })
})
