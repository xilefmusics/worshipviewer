import { describe, expect, it } from 'vitest'

import {
  readPlayerScrollPreferences,
  scrollTypeForOrientation,
  writePlayerScrollLandscape,
  writePlayerScrollPortrait,
} from '@/lib/player-scroll-preference'

describe('player scroll preferences', () => {
  it('defaults to page mode for both orientations', () => {
    const storage = new Map<string, string>()
    const prefs = readPlayerScrollPreferences({
      getItem: (key) => storage.get(key) ?? null,
    })
    expect(prefs).toEqual({ portrait: 'one_page', landscape: 'one_page' })
  })

  it('persists portrait and landscape separately', () => {
    const storage = new Map<string, string>()
    const mockStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    }

    writePlayerScrollPortrait('book', mockStorage)
    writePlayerScrollLandscape('one_page', mockStorage)

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
    expect(readPlayerScrollPreferences({ getItem: (key) => storage.get(key) ?? null })).toEqual({
      portrait: 'one_page',
      landscape: 'one_page',
    })
  })

  it('selects scroll mode by orientation', () => {
    expect(
      scrollTypeForOrientation('portrait', { portrait: 'book', landscape: 'one_page' }),
    ).toBe('book')
    expect(
      scrollTypeForOrientation('landscape', { portrait: 'book', landscape: 'one_page' }),
    ).toBe('one_page')
  })
})
