import { useCallback, useEffect, useRef, useState } from 'react'

import { mediaAssetDataUrl } from '@/api/media-upload'
import { AvGeometryOverlayShape } from '@/components/player/av/AvGeometryOverlayShape'
import {
  normalizeAvBackgroundPreset,
  type AvBackgroundLayer as AvBackgroundLayerPrefs,
  type AvGeometryOverlay,
} from '@/lib/player/av-preferences'
import { cn } from '@/lib/utils'

import './player-av.css'

type AvBackgroundLayerProps = {
  layer: AvBackgroundLayerPrefs
  geometryOverlay?: AvGeometryOverlay
  geometryOverlayOpacity?: number
  geometryOverlayColor?: number
  geometryOverlaySize?: number
  geometryOverlayThickness?: number
  geometryOverlayRotatedBackground?: boolean
  fallbackLayer?: AvBackgroundLayerPrefs
  className?: string
  videoPreview?: boolean
}

export function AvBackgroundLayer({
  layer,
  geometryOverlay = 'none',
  geometryOverlayOpacity = 77,
  geometryOverlayColor = 77,
  geometryOverlaySize = 77,
  geometryOverlayThickness = 77,
  geometryOverlayRotatedBackground = false,
  fallbackLayer,
  className,
  videoPreview = false,
}: AvBackgroundLayerProps) {
  const [failedAssetKey, setFailedAssetKey] = useState<string | null>(null)
  const backgroundVideoRef = useRef<HTMLVideoElement>(null)
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
    return (
      <AvBackgroundLayer
        layer={fallbackLayer}
        geometryOverlay={geometryOverlay}
        geometryOverlayOpacity={geometryOverlayOpacity}
        geometryOverlayColor={geometryOverlayColor}
        geometryOverlaySize={geometryOverlaySize}
        geometryOverlayThickness={geometryOverlayThickness}
        geometryOverlayRotatedBackground={geometryOverlayRotatedBackground}
        className={className}
        videoPreview={videoPreview}
      />
    )
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
            ref={backgroundVideoRef}
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
      {geometryOverlay !== 'none' ? (
        <AvGeometryOverlayShape
          overlay={geometryOverlay}
          opacity={geometryOverlayOpacity}
          color={geometryOverlayColor}
          size={geometryOverlaySize}
          thickness={geometryOverlayThickness}
          rotatedBackground={geometryOverlayRotatedBackground}
          videoSrc={geometryOverlayRotatedBackground && layer.video && !videoPreview
            ? mediaAssetDataUrl(layer.video.mediaId, layer.video.assetId)
            : undefined}
          backgroundImageSrc={geometryOverlayRotatedBackground
            ? layer.image
              ? mediaAssetDataUrl(layer.image.mediaId, layer.image.assetId)
              : videoPreview && layer.video?.thumbnailAssetId
                ? mediaAssetDataUrl(layer.video.mediaId, layer.video.thumbnailAssetId)
                : preset === 2
                  ? '/ray.png'
                : undefined
            : undefined}
          masterVideoRef={backgroundVideoRef}
          className="av-background-layer__geometry"
        />
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
