import type { AvBackgroundLayer as AvBackgroundLayerPrefs } from '@/lib/player/av-preferences'
import { cn } from '@/lib/utils'

import './player-av.css'

type AvBackgroundLayerProps = {
  layer: AvBackgroundLayerPrefs
  className?: string
}

export function AvBackgroundLayer({ layer, className }: AvBackgroundLayerProps) {
  return (
    <div
      className={cn(
        'av-background-layer',
        `av-background-layer--preset-${layer.preset}`,
        className,
      )}
      aria-hidden
    />
  )
}
