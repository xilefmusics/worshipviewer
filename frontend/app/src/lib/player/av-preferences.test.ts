import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AV_PREFERENCES,
  buildAvProjectionPayload,
  readAvPreferences,
  writeAvPreferences,
} from '@/lib/player/av-preferences'

const baseInput = {
  contentText: 'Hello',
  contentLayer: DEFAULT_AV_PREFERENCES.contentLayer,
  backgroundLayer: DEFAULT_AV_PREFERENCES.backgroundLayer,
  transition: DEFAULT_AV_PREFERENCES.transition,
  itemTitle: 'Song',
  nextPreview: 'Next',
}

describe('buildAvProjectionPayload', () => {
  it('includes structured lines and primary fallback text when live', () => {
    const contentLines = [
      { primary: 'Hello', secondary: 'Hallo' },
      { primary: 'World' },
    ]

    const payload = buildAvProjectionPayload({
      ...baseInput,
      contentLines,
      screenState: 'live',
    })

    expect(payload.contentText).toBe('Hello')
    expect(payload.contentLines).toEqual(contentLines)
    expect(payload.screenState).toBe('live')
  })

  it('returns a legacy primary-only payload when contentLines are absent', () => {
    const payload = buildAvProjectionPayload({
      ...baseInput,
      screenState: 'live',
    })

    expect(payload.contentText).toBe('Hello')
    expect(payload.contentLines).toBeUndefined()
  })

  it('omits contentLines for blank and blackout screen states', () => {
    const contentLines = [{ primary: 'Hello', secondary: 'Hallo' }]

    expect(
      buildAvProjectionPayload({
        ...baseInput,
        contentLines,
        screenState: 'blank',
      }).contentLines,
    ).toBeUndefined()
    expect(
      buildAvProjectionPayload({
        ...baseInput,
        contentLines,
        screenState: 'blackout',
      }).contentLines,
    ).toBeUndefined()
  })

  it('includes the selected custom background in projection payloads', () => {
    const backgroundLayer = {
      preset: 2 as const,
      image: { mediaId: 'media:bg', assetId: 'asset:bg' },
    }
    const payload = buildAvProjectionPayload({
      ...baseInput,
      backgroundLayer,
      screenState: 'live',
    })
    expect(payload.backgroundLayer).toEqual(backgroundLayer)
  })
})

describe('readAvPreferences', () => {
  it.each([0, 1, 3, 4])('migrates removed background preset %i to Default', (preset) => {
    const storage = {
      getItem: () => JSON.stringify({ backgroundLayer: { preset } }),
    }

    expect(readAvPreferences(storage).backgroundLayer.preset).toBe(2)
  })

  it('persists a custom image background alongside its preset fallback', () => {
    const storage = {
      getItem: () => JSON.stringify({
        backgroundLayer: {
          preset: 4,
          image: { mediaId: 'media:bg', assetId: 'asset:bg' },
        },
      }),
    }
    expect(readAvPreferences(storage).backgroundLayer).toEqual({
      preset: 2,
      image: { mediaId: 'media:bg', assetId: 'asset:bg' },
    })
  })

  it('drops incomplete custom background references and keeps the saved preset', () => {
    const storage = {
      getItem: () => JSON.stringify({
        backgroundLayer: { preset: 3, image: { mediaId: 'media:bg' } },
      }),
    }
    expect(readAvPreferences(storage).backgroundLayer).toEqual({ preset: 2 })
  })

  it('writes a selected custom background to preference storage', () => {
    let saved = ''
    const storage = {
      setItem: (_key: string, value: string) => {
        saved = value
      },
    }
    writeAvPreferences({
      ...DEFAULT_AV_PREFERENCES,
      backgroundLayer: {
        preset: 2,
        image: { mediaId: 'media:bg', assetId: 'asset:bg' },
      },
    }, storage)
    expect(JSON.parse(saved).backgroundLayer).toEqual({
      preset: 2,
      image: { mediaId: 'media:bg', assetId: 'asset:bg' },
    })
  })

  it('adds text lightness defaults to legacy preferences', () => {
    const storage = {
      getItem: () => JSON.stringify({ contentLayer: { fontSize: 72 } }),
    }

    expect(readAvPreferences(storage).contentLayer).toMatchObject({
      fontSize: 72,
      primaryTextLightness: 100,
      secondaryTextLightness: 65,
    })
  })

  it('preserves and clamps text lightness values', () => {
    const validStorage = {
      getItem: () =>
        JSON.stringify({
          contentLayer: {
            primaryTextLightness: 24,
            secondaryTextLightness: 76,
          },
        }),
    }
    const clampedStorage = {
      getItem: () =>
        JSON.stringify({
          contentLayer: {
            primaryTextLightness: -1,
            secondaryTextLightness: 101,
          },
        }),
    }

    expect(readAvPreferences(validStorage).contentLayer).toMatchObject({
      primaryTextLightness: 24,
      secondaryTextLightness: 76,
    })
    expect(readAvPreferences(clampedStorage).contentLayer).toMatchObject({
      primaryTextLightness: 0,
      secondaryTextLightness: 100,
    })
  })
})
