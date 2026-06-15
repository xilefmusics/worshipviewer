import { describe, expect, it } from 'vitest'

import {
  initialPlayerNavState,
  resolveInitialPlayerNav,
} from '@/lib/player/next-player-state'
import {
  readPlayerViewState,
  writePlayerViewState,
  playerViewStorageKey,
  setLanguageForItem,
  clearLanguageForItem,
  setPlayerNavPosition,
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

  it('persists and reads language settings', () => {
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
      { transposeByItem: {}, languageByItem: { 0: 1 } },
      mockStorage,
    )

    const loaded = readPlayerViewState('song', 's1', mockStorage)
    expect(loaded.languageByItem?.[0]).toBe(1)
  })

  it('uses empty language settings for legacy stored state', () => {
    const storage = new Map<string, string>([
      [playerViewStorageKey('song', 's1'), JSON.stringify({ transposeByItem: { 0: 'G' } })],
    ])
    const mockStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
    }

    const loaded = readPlayerViewState('song', 's1', mockStorage)
    expect(loaded.transposeByItem[0]).toBe('G')
    expect(loaded.languageByItem).toEqual({})
  })

  it('persists and reads item index', () => {
    const storage = new Map<string, string>()
    const mockStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v)
      },
    }

    writePlayerViewState('setlist', 'sl1', { transposeByItem: {}, itemIndex: 5 }, mockStorage)

    expect(readPlayerViewState('setlist', 'sl1', mockStorage).itemIndex).toBe(5)
  })

  it('persists and reads page offset', () => {
    const storage = new Map<string, string>()
    const mockStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v)
      },
    }

    writePlayerViewState(
      'setlist',
      'sl1',
      { transposeByItem: {}, itemIndex: 2, pageOffset: 1 },
      mockStorage,
    )

    const loaded = readPlayerViewState('setlist', 'sl1', mockStorage)
    expect(loaded.itemIndex).toBe(2)
    expect(loaded.pageOffset).toBe(1)
  })

  it('setPlayerNavPosition updates index and offset together', () => {
    const next = setPlayerNavPosition({ transposeByItem: {} }, 4, 2)
    expect(next.itemIndex).toBe(4)
    expect(next.pageOffset).toBe(2)
  })

  it('sets and clears language settings for an item', () => {
    const selected = setLanguageForItem({ transposeByItem: {} }, 2, 1)
    expect(selected.languageByItem?.[2]).toBe(1)

    const cleared = clearLanguageForItem(selected, 2)
    expect(cleared.languageByItem?.[2]).toBeUndefined()
  })
})

describe('resolveInitialPlayerNav', () => {
  it('restores saved position when no URL index is provided', () => {
    expect(
      resolveInitialPlayerNav({
        savedItemIndex: 3,
        savedPageOffset: 1,
        serverIndex: 0,
        itemCount: 10,
      }),
    ).toEqual({ index: 3, pageOffset: 1 })
  })

  it('prefers URL index and resets page offset', () => {
    expect(
      resolveInitialPlayerNav({
        savedItemIndex: 3,
        savedPageOffset: 1,
        initialIndex: 7,
        serverIndex: 0,
        itemCount: 10,
      }),
    ).toEqual({ index: 7, pageOffset: 0 })
  })

  it('falls back to server index when nothing is saved', () => {
    expect(
      resolveInitialPlayerNav({
        serverIndex: 2,
        itemCount: 10,
      }),
    ).toEqual(initialPlayerNavState(2, 10))
  })
})
