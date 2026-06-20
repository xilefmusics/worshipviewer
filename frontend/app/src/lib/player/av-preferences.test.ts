import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AV_PREFERENCES,
  buildAvProjectionPayload,
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
})
