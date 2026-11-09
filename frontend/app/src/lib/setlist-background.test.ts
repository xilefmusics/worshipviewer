import { describe, expect, it } from 'vitest'

import {
  avBackgroundToSetlistBackground,
  setlistBackgroundToAvBackground,
} from '@/lib/setlist-background'

describe('setlist song background conversion', () => {
  it('preserves built-in preset overrides', () => {
    const background = { preset: 2 }
    expect(avBackgroundToSetlistBackground(setlistBackgroundToAvBackground(background))).toEqual(background)
  })

  it('round-trips custom image backgrounds', () => {
    const background = {
      preset: 2,
      image: { media_id: 'media:image', asset_id: 'asset:image' },
    }
    expect(avBackgroundToSetlistBackground(setlistBackgroundToAvBackground(background))).toEqual(background)
  })

  it('round-trips custom video backgrounds including thumbnails', () => {
    const background = {
      preset: 2,
      video: {
        media_id: 'media:video',
        asset_id: 'asset:video',
        thumbnail_asset_id: 'asset:thumb',
      },
    }
    expect(avBackgroundToSetlistBackground(setlistBackgroundToAvBackground(background))).toEqual(background)
  })
})
