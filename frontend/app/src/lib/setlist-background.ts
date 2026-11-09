import type { components } from '@/api/schema'
import type { AvBackgroundLayer } from '@/lib/player/av-preferences'
import { normalizeAvBackgroundPreset } from '@/lib/player/av-preferences'

export type SetlistSongBackground = components['schemas']['PlayerBackground']

export function avBackgroundToSetlistBackground(layer: AvBackgroundLayer): SetlistSongBackground {
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
