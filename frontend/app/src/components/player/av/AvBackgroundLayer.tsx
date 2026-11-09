import { useCallback, useEffect, useState } from 'react'

import { mediaAssetDataUrl } from '@/api/media-upload'
import {
  normalizeAvBackgroundPreset,
  type AvBackgroundLayer as AvBackgroundLayerPrefs,
} from '@/lib/player/av-preferences'
import { cn } from '@/lib/utils'

import './player-av.css'

type AvBackgroundLayerProps = {
  layer: AvBackgroundLayerPrefs
  fallbackLayer?: AvBackgroundLayerPrefs
  className?: string
  videoPreview?: boolean
}

export function AvBackgroundLayer({
  layer,
  fallbackLayer,
  className,
  videoPreview = false,
}: AvBackgroundLayerProps) {
  const [failedAssetKey, setFailedAssetKey] = useState<string | null>(null)
  const assetKey = layer.image
    ? `image:${layer.image.mediaId}:${layer.image.assetId}`
    : layer.video
      ? `video:${layer.video.mediaId}:${layer.video.assetId}`
      : null
  const useFallback = Boolean(fallbackLayer && assetKey && failedAssetKey === assetKey)
  const hasFallback = Boolean(fallbackLayer)
  const markUnavailable = useCallback(() => {
    if (assetKey && hasFallback) setFailedAssetKey(assetKey)
  }, [assetKey, hasFallback])

  if (useFallback && fallbackLayer) {
    return <AvBackgroundLayer layer={fallbackLayer} className={className} videoPreview={videoPreview} />
  }
  const preset = normalizeAvBackgroundPreset(layer.preset)
  return (
    <div
      className={cn(
        'av-background-layer',
        `av-background-layer--preset-${preset}`,
        className,
      )}
      aria-hidden
    >
      {layer.image ? (
        <BackgroundImage
          mediaId={layer.image.mediaId}
          assetId={layer.image.assetId}
          onUnavailable={markUnavailable}
        />
      ) : null}
      {layer.video ? (
        videoPreview ? (
          layer.video.thumbnailAssetId ? (
            <img
              className="av-background-layer__image"
              src={mediaAssetDataUrl(layer.video.mediaId, layer.video.thumbnailAssetId)}
              alt=""
              crossOrigin="use-credentials"
              onError={markUnavailable}
            />
          ) : null
        ) : (
          <video
            className="av-background-layer__video"
            src={mediaAssetDataUrl(layer.video.mediaId, layer.video.assetId)}
            poster={layer.video.thumbnailAssetId
              ? mediaAssetDataUrl(layer.video.mediaId, layer.video.thumbnailAssetId)
              : undefined}
            autoPlay
            loop
            muted
            playsInline
            crossOrigin="use-credentials"
            preload="auto"
            onError={markUnavailable}
          />
        )
      ) : null}
    </div>
  )
}

function BackgroundImage({
  mediaId,
  assetId,
  onUnavailable,
}: {
  mediaId: string
  assetId: string
  onUnavailable: () => void
}) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let currentUrl: string | null = null
    let cancelled = false
    void fetch(mediaAssetDataUrl(mediaId, assetId), {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('background_image_unavailable')
        return response.blob()
      })
      .then((blob) => {
        if (blob.size === 0) throw new Error('background_image_empty')
        currentUrl = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(currentUrl)
          return
        }
        setSrc(currentUrl)
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null)
          onUnavailable()
        }
      })
    return () => {
      cancelled = true
      controller.abort()
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [assetId, mediaId, onUnavailable])

  return src ? (
    <img
      className="av-background-layer__image"
      src={src}
      alt=""
      onError={onUnavailable}
    />
  ) : null
}
