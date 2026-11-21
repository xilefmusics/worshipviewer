import { describe, expect, it } from 'vitest'

import {
  avForegroundToSetlistForeground,
  avBackgroundToSetlistBackground,
  setlistBackgroundGeometryToAvSettings,
  setlistBackgroundToAvBackground,
  setlistForegroundToAvSettings,
} from '@/lib/setlist-background'
import { DEFAULT_AV_PREFERENCES } from '@/lib/player/av-preferences'

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

  it('round-trips geometry settings and keeps legacy backgrounds inheriting them', () => {
    const geometry = {
      geometryOverlay: 'cross' as const,
      geometryOverlayRotatedBackground: true,
      geometryOverlayOpacity: 82,
      geometryOverlayColor: 64,
      geometryOverlaySize: 73,
      geometryOverlayThickness: 71,
    }
    const background = avBackgroundToSetlistBackground(
      { preset: 2, image: { mediaId: 'media:image', assetId: 'asset:image' } },
      geometry,
    )

    expect(background).toMatchObject({
      geometry_overlay: 'cross',
      geometry_overlay_rotated_background: true,
      geometry_overlay_opacity: 82,
      geometry_overlay_color: 64,
      geometry_overlay_size: 73,
      geometry_overlay_thickness: 71,
    })
    expect(setlistBackgroundGeometryToAvSettings(background, DEFAULT_AV_PREFERENCES)).toEqual(geometry)
    expect(
      setlistBackgroundGeometryToAvSettings(
        { preset: 2, image: { media_id: 'media:old', asset_id: 'asset:old' } },
        DEFAULT_AV_PREFERENCES,
      ),
    ).toEqual({
      geometryOverlay: DEFAULT_AV_PREFERENCES.geometryOverlay,
      geometryOverlayRotatedBackground: DEFAULT_AV_PREFERENCES.geometryOverlayRotatedBackground,
      geometryOverlayOpacity: DEFAULT_AV_PREFERENCES.geometryOverlayOpacity,
      geometryOverlayColor: DEFAULT_AV_PREFERENCES.geometryOverlayColor,
      geometryOverlaySize: DEFAULT_AV_PREFERENCES.geometryOverlaySize,
      geometryOverlayThickness: DEFAULT_AV_PREFERENCES.geometryOverlayThickness,
    })
  })

  it('round-trips the complete foreground layer and bilingual setting', () => {
    const foreground = avForegroundToSetlistForeground(
      {
        ...DEFAULT_AV_PREFERENCES.contentLayer,
        balanceSlideLines: false,
        fontSize: 72,
        fontFamily: 'arial',
        horizontalAlign: 'right',
        textTransform: 'capitalize',
      },
      true,
    )

    expect(foreground.bilingual_enabled).toBe(true)
    expect(foreground.content_layer).toMatchObject({
      balance_slide_lines: false,
      font_size: 72,
      font_family: 'arial',
      horizontal_align: 'right',
      text_transform: 'capitalize',
    })
    expect(setlistForegroundToAvSettings(foreground)).toEqual({
      contentLayer: {
        ...DEFAULT_AV_PREFERENCES.contentLayer,
        balanceSlideLines: false,
        fontSize: 72,
        fontFamily: 'arial',
        horizontalAlign: 'right',
        textTransform: 'capitalize',
      },
      bilingualEnabled: true,
    })
  })
})
