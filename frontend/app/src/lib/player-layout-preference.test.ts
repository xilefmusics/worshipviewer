import { describe, expect, it } from 'vitest'

import {
  layoutPreferenceToScrollType,
  scrollTypeToLayoutPreference,
} from '@/lib/player/effective-scroll-type'
import {
  PLAYER_LAYOUT_LANDSCAPE_KEY,
  PLAYER_LAYOUT_PORTRAIT_KEY,
  PLAYER_SCROLL_LANDSCAPE_KEY,
  PLAYER_SCROLL_PORTRAIT_KEY,
  readPlayerLayoutPreferences,
  writePlayerLayoutLandscape,
  writePlayerLayoutLinkedOrientations,
  writePlayerLayoutPortrait,
} from '@/lib/player-scroll-preference'

describe('readPlayerLayoutPreferences', () => {
  it('defaults to linked free adaptive layout for both orientations', () => {
    const storage = new Map<string, string>()
    const expected = {
      mode: 'free' as const,
      pageCount: 1 as const,
      columnCount: 'adaptive' as const,
      nextSongPreview: false,
      overflowStyle: 'scroll' as const,
      expandSections: false,
    }
    const mockStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: () => {},
      removeItem: () => {},
    }
    expect(readPlayerLayoutPreferences(mockStorage)).toEqual({
      linkedOrientations: true,
      portrait: expected,
      landscape: expected,
    })
  })

  it('persists portrait and landscape separately when unlinked', () => {
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

    writePlayerLayoutPortrait(
      {
        mode: 'free',
        pageCount: 1,
        columnCount: 3,
        nextSongPreview: true,
        overflowStyle: 'scroll',
        expandSections: false,
      },
      mockStorage,
    )
    writePlayerLayoutLandscape(
      {
        mode: 'page',
        pageCount: 2,
        columnCount: 2,
        nextSongPreview: false,
        overflowStyle: 'cut',
        expandSections: false,
      },
      mockStorage,
    )

    expect(readPlayerLayoutPreferences(mockStorage)).toEqual({
      linkedOrientations: false,
      portrait: {
        mode: 'free',
        pageCount: 1,
        columnCount: 3,
        nextSongPreview: true,
        overflowStyle: 'scroll',
        expandSections: false,
      },
      landscape: {
        mode: 'page',
        pageCount: 2,
        columnCount: 2,
        nextSongPreview: false,
        overflowStyle: 'cut',
        expandSections: false,
      },
    })
  })

  it('mirrors portrait to landscape when orientations are linked on write', () => {
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

    writePlayerLayoutPortrait(
      {
        mode: 'free',
        pageCount: 1,
        columnCount: 'adaptive',
        nextSongPreview: false,
        overflowStyle: 'cut',
        expandSections: true,
      },
      mockStorage,
    )

    expect(JSON.parse(storage.get(PLAYER_LAYOUT_LANDSCAPE_KEY) ?? '{}')).toMatchObject({
      columnCount: 'adaptive',
      expandSections: true,
    })
  })

  it('migrates legacy scroll keys into layout JSON', () => {
    const storage = new Map<string, string>([
      [PLAYER_SCROLL_PORTRAIT_KEY, 'two_column_next'],
      [PLAYER_SCROLL_LANDSCAPE_KEY, 'book'],
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

    const prefs = readPlayerLayoutPreferences(mockStorage)
    expect(prefs.linkedOrientations).toBe(true)
    expect(prefs.portrait).toEqual({
      mode: 'free',
      pageCount: 1,
      columnCount: 2,
      nextSongPreview: true,
      overflowStyle: 'scroll',
      expandSections: false,
    })
    expect(prefs.landscape).toEqual(prefs.portrait)
    expect(storage.has(PLAYER_SCROLL_PORTRAIT_KEY)).toBe(false)
    expect(storage.has(PLAYER_LAYOUT_PORTRAIT_KEY)).toBe(true)
  })

  it('maps legacy half_page values to page mode on migration', () => {
    const storage = new Map<string, string>([[PLAYER_SCROLL_PORTRAIT_KEY, 'half_page']])
    const mockStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    }

    expect(readPlayerLayoutPreferences(mockStorage).portrait.mode).toBe('page')
    expect(readPlayerLayoutPreferences(mockStorage).portrait.pageCount).toBe(1)
  })
})

describe('layoutPreferenceToScrollType', () => {
  it('maps page and free preferences to scroll types', () => {
    expect(
      layoutPreferenceToScrollType({
        mode: 'page',
        pageCount: 1,
        columnCount: 2,
        nextSongPreview: false,
        overflowStyle: 'cut',
        expandSections: false,
      }),
    ).toBe('one_page')
    expect(
      layoutPreferenceToScrollType({
        mode: 'page',
        pageCount: 2,
        columnCount: 2,
        nextSongPreview: false,
        overflowStyle: 'cut',
        expandSections: false,
      }),
    ).toBe('book')
    expect(
      layoutPreferenceToScrollType({
        mode: 'free',
        pageCount: 1,
        columnCount: 1,
        nextSongPreview: false,
        overflowStyle: 'cut',
        expandSections: false,
      }),
    ).toBe('one_column')
    expect(
      layoutPreferenceToScrollType({
        mode: 'free',
        pageCount: 1,
        columnCount: 1,
        nextSongPreview: true,
        overflowStyle: 'scroll',
        expandSections: false,
      }),
    ).toBe('one_column_next')
  })
})

describe('scrollTypeToLayoutPreference', () => {
  it('round-trips supported scroll types without overflow style', () => {
    expect(scrollTypeToLayoutPreference('three_column_next')).toEqual({
      mode: 'free',
      pageCount: 1,
      columnCount: 3,
      nextSongPreview: true,
      overflowStyle: 'scroll',
      expandSections: false,
    })
    expect(
      layoutPreferenceToScrollType(scrollTypeToLayoutPreference('three_column_next')),
    ).toBe('three_column_next')
  })
})
