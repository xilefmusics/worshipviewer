import { useEffect, useState } from 'react'

import { mediaAssetDataUrl } from '@/api/media-upload'
import {
  normalizeAvBackgroundPreset,
  type AvBackgroundLayer as AvBackgroundLayerPrefs,
} from '@/lib/player/av-preferences'
import { cn } from '@/lib/utils'

import './player-av.css'

type AvBackgroundLayerProps = {
  layer: AvBackgroundLayerPrefs
  className?: string
  videoPreview?: boolean
}

export function AvBackgroundLayer({ layer, className, videoPreview = false }: AvBackgroundLayerProps) {
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
        <BackgroundImage mediaId={layer.image.mediaId} assetId={layer.image.assetId} />
      ) : null}
      {layer.video ? (
        videoPreview ? (
          layer.video.thumbnailAssetId ? (
            <img
              className="av-background-layer__image"
              src={mediaAssetDataUrl(layer.video.mediaId, layer.video.thumbnailAssetId)}
              alt=""
              crossOrigin="use-credentials"
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
          />
        )
      ) : null}
    </div>
  )
}

function BackgroundImage({ mediaId, assetId }: { mediaId: string; assetId: string }) {
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
        if (!cancelled) setSrc(null)
      })
    return () => {
      cancelled = true
      controller.abort()
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [assetId, mediaId])

  return src ? <img className="av-background-layer__image" src={src} alt="" /> : null
}
