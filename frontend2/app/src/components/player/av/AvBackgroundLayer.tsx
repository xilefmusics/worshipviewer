import type { AvBackgroundLayer as AvBackgroundLayerPrefs } from '@/lib/player/av-preferences'
import { cn } from '@/lib/utils'

import './player-av.css'

type AvBackgroundLayerProps = {
  layer: AvBackgroundLayerPrefs
  className?: string
}

export function AvBackgroundLayer({ layer, className }: AvBackgroundLayerProps) {
  const brightness = layer.brightness / 100
  const filterStyle = brightness === 1 ? undefined : { filter: `brightness(${brightness})` }

  if (layer.kind === 'gradient') {
    return (
      <div
        className={cn('av-background-layer', className)}
        style={{
          backgroundImage: `linear-gradient(${layer.gradientAngle}deg, ${layer.gradientFrom}, ${layer.gradientTo})`,
          ...filterStyle,
        }}
        aria-hidden
      />
    )
  }

  if (layer.kind === 'image' && layer.mediaUrl.trim()) {
    return (
      <img
        src={layer.mediaUrl}
        alt=""
        className={cn('av-background-layer av-background-layer__media', className)}
        style={filterStyle}
      />
    )
  }

  if (layer.kind === 'video' && layer.mediaUrl.trim()) {
    return (
      <video
        src={layer.mediaUrl}
        className={cn('av-background-layer av-background-layer__media', className)}
        style={filterStyle}
        autoPlay
        loop
        muted
        playsInline
      />
    )
  }

  return (
    <div
      className={cn('av-background-layer', className)}
      style={{ backgroundColor: layer.color, ...filterStyle }}
      aria-hidden
    />
  )
}
