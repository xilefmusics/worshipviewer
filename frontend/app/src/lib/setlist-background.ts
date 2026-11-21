import type { components } from '@/api/schema'
import type {
  AvBackgroundLayer,
  AvContentLayer,
  AvPreferences,
} from '@/lib/player/av-preferences'
import { normalizeAvBackgroundPreset } from '@/lib/player/av-preferences'

export type SetlistSongBackground = components['schemas']['PlayerBackground']
export type SetlistSongForeground = components['schemas']['PlayerForegroundSettings']

export type AvBackgroundGeometrySettings = Pick<
  AvPreferences,
  | 'geometryOverlay'
  | 'geometryOverlayRotatedBackground'
  | 'geometryOverlayOpacity'
  | 'geometryOverlayColor'
  | 'geometryOverlaySize'
  | 'geometryOverlayThickness'
>

export function avBackgroundToSetlistBackground(
  layer: AvBackgroundLayer,
  geometry?: AvBackgroundGeometrySettings,
): SetlistSongBackground {
  return {
    preset: normalizeAvBackgroundPreset(layer.preset),
    ...(layer.image
      ? { image: { media_id: layer.image.mediaId, asset_id: layer.image.assetId } }
      : {}),
    ...(layer.video
      ? {
          video: {
            media_id: layer.video.mediaId,
            asset_id: layer.video.assetId,
            ...(layer.video.thumbnailAssetId
              ? { thumbnail_asset_id: layer.video.thumbnailAssetId }
              : {}),
          },
        }
      : {}),
    ...(geometry
      ? {
          geometry_overlay: geometry.geometryOverlay,
          geometry_overlay_rotated_background: geometry.geometryOverlayRotatedBackground,
          geometry_overlay_opacity: geometry.geometryOverlayOpacity,
          geometry_overlay_color: geometry.geometryOverlayColor,
          geometry_overlay_size: geometry.geometryOverlaySize,
          geometry_overlay_thickness: geometry.geometryOverlayThickness,
        }
      : {}),
  }
}

export function setlistBackgroundToAvBackground(
  background: SetlistSongBackground,
): AvBackgroundLayer {
  return {
    preset: normalizeAvBackgroundPreset(background.preset),
    ...(background.image
      ? { image: { mediaId: background.image.media_id, assetId: background.image.asset_id } }
      : {}),
    ...(!background.image && background.video
      ? {
          video: {
            mediaId: background.video.media_id,
            assetId: background.video.asset_id,
            ...(background.video.thumbnail_asset_id
              ? { thumbnailAssetId: background.video.thumbnail_asset_id }
              : {}),
          },
        }
      : {}),
  }
}

export function setlistBackgroundGeometryToAvSettings(
  background: SetlistSongBackground | null | undefined,
  fallback: AvBackgroundGeometrySettings,
): AvBackgroundGeometrySettings {
  return {
    geometryOverlay: background?.geometry_overlay ?? fallback.geometryOverlay,
    geometryOverlayRotatedBackground:
      background?.geometry_overlay_rotated_background ?? fallback.geometryOverlayRotatedBackground,
    geometryOverlayOpacity: background?.geometry_overlay_opacity ?? fallback.geometryOverlayOpacity,
    geometryOverlayColor: background?.geometry_overlay_color ?? fallback.geometryOverlayColor,
    geometryOverlaySize: background?.geometry_overlay_size ?? fallback.geometryOverlaySize,
    geometryOverlayThickness:
      background?.geometry_overlay_thickness ?? fallback.geometryOverlayThickness,
  }
}

export function avForegroundToSetlistForeground(
  contentLayer: AvContentLayer,
  bilingualEnabled: boolean,
): SetlistSongForeground {
  return {
    bilingual_enabled: bilingualEnabled,
    content_layer: {
      max_lines_per_slide: contentLayer.maxLinesPerSlide,
      balance_slide_lines: contentLayer.balanceSlideLines,
      font_size: contentLayer.fontSize,
      font_family: contentLayer.fontFamily ?? 'rubik',
      text_align: contentLayer.textAlign,
      vertical_align: contentLayer.verticalAlign,
      horizontal_align: contentLayer.horizontalAlign,
      text_shadow: contentLayer.textShadow,
      text_transform: contentLayer.textTransform,
      primary_text_lightness: contentLayer.primaryTextLightness,
      secondary_text_lightness: contentLayer.secondaryTextLightness,
    },
  }
}

export function setlistForegroundToAvSettings(
  foreground: SetlistSongForeground,
): { contentLayer: AvContentLayer; bilingualEnabled: boolean } {
  const content = foreground.content_layer
  return {
    contentLayer: {
      maxLinesPerSlide: content.max_lines_per_slide,
      balanceSlideLines: content.balance_slide_lines,
      fontSize: content.font_size,
      fontFamily: content.font_family,
      textAlign: content.text_align,
      verticalAlign: content.vertical_align,
      horizontalAlign: content.horizontal_align,
      textShadow: content.text_shadow,
      textTransform: content.text_transform,
      primaryTextLightness: content.primary_text_lightness,
      secondaryTextLightness: content.secondary_text_lightness,
    },
    bilingualEnabled: foreground.bilingual_enabled,
  }
}
