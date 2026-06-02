import { describe, expect, it } from 'vitest'

import { layoutPreferenceToScrollType } from '@/lib/player/effective-scroll-type'
import {
  readPlayerLayoutPreferences,
  readPlayerScrollPreferences,
  scrollTypeForOrientation,
  writePlayerLayoutLinkedOrientations,
  writePlayerLayoutPortrait,
  writePlayerScrollLandscape,
  writePlayerScrollPortrait,
} from '@/lib/player-scroll-preference'

describe('player scroll preferences (legacy compatibility)', () => {
  it('defaults to two-column free scroll type for both orientations', () => {
    const storage = new Map<string, string>()
    const prefs = readPlayerScrollPreferences({
      getItem: (key) => storage.get(key) ?? null,
      setItem: () => {},
      removeItem: () => {},
    })
    expect(prefs).toEqual({ portrait: 'two_column', landscape: 'two_column' })
  })

  it('persists portrait and landscape separately via layout writes', () => {
    const storage = new Map<string, string>()
    const mockStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    }

    writePlayerScrollPortrait('book', mockStorage)
    writePlayerScrollLandscape('one_page', mockStorage)

    writePlayerLayoutLinkedOrientations(false, mockStorage)

    expect(readPlayerScrollPreferences(mockStorage)).toEqual({
      portrait: 'book',
      landscape: 'one_page',
    })
  })

  it('maps legacy scroll values to page mode', () => {
    const storage = new Map<string, string>([
      ['wv_player_scroll_portrait', 'half_page'],
      ['wv_player_scroll_landscape', 'two_page'],
    ])
    const mockStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    }
    expect(readPlayerScrollPreferences(mockStorage)).toEqual({
      portrait: 'one_page',
      landscape: 'one_page',
    })
  })

  it('keeps separate landscape scroll type when orientations are unlinked', () => {
    const storage = new Map<string, string>()
    const mockStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    }

    writePlayerLayoutLinkedOrientations(false, mockStorage)
    writePlayerScrollPortrait('book', mockStorage)
    writePlayerScrollLandscape('three_column', mockStorage)

    expect(readPlayerScrollPreferences(mockStorage)).toEqual({
      portrait: 'book',
      landscape: 'three_column',
    })
  })

  it('selects scroll mode by orientation', () => {
    const layout = readPlayerLayoutPreferences({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    })
    writePlayerLayoutPortrait(
      { ...layout.portrait, mode: 'page', pageCount: 2 },
      {
        getItem: (key) =>
          key === 'wv_player_layout_portrait'
            ? JSON.stringify({ ...layout.portrait, mode: 'page', pageCount: 2 })
            : null,
        setItem: () => {},
        removeItem: () => {},
      },
    )
    expect(
      scrollTypeForOrientation('portrait', {
        portrait: 'book',
        landscape: 'one_page',
      }),
    ).toBe('book')
    expect(
      scrollTypeForOrientation('landscape', {
        portrait: 'book',
        landscape: 'one_page',
      }),
    ).toBe('one_page')
  })

  it('derives scroll type from layout preferences', () => {
    const prefs = readPlayerLayoutPreferences({
      getItem: (key) => {
        if (key === 'wv_player_layout_portrait') {
          return JSON.stringify({
            mode: 'free',
            pageCount: 1,
            columnCount: 1,
            nextSongPreview: false,
            overflowStyle: 'cut',
          })
        }
        return null
      },
      setItem: () => {},
      removeItem: () => {},
    })
    expect(layoutPreferenceToScrollType(prefs.portrait)).toBe('one_column')
    expect(
      scrollTypeForOrientation('portrait', readPlayerLayoutPreferences({
        getItem: (key) => {
          if (key === 'wv_player_layout_portrait') {
            return JSON.stringify({
              mode: 'free',
              pageCount: 1,
              columnCount: 1,
              nextSongPreview: false,
              overflowStyle: 'cut',
            })
          }
          return null
        },
        setItem: () => {},
        removeItem: () => {},
      })),
    ).toBe('one_column')
  })
})
