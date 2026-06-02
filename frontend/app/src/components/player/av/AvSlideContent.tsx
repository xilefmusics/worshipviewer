import type { AvContentLayer } from '@/lib/player/av-preferences'
import { cn } from '@/lib/utils'

import './player-av.css'

type AvSlideContentProps = {
  text: string
  contentLayer: AvContentLayer
  className?: string
  compact?: boolean
  /** Sidebar preview: fixed px type instead of cqw (small container). */
  preview?: boolean
}

export function AvSlideContent({
  text,
  contentLayer,
  className,
  compact = false,
  preview = false,
}: AvSlideContentProps) {
  const fontSizeCqw = contentLayer.fontSize / 19.2
  const paddingCqw = fontSizeCqw * 2
  const previewFontPx = contentLayer.fontSize * 0.22
  const lines = compact ? [text.split('\n')[0] ?? ''] : text.split('\n')

  return (
    <div
      className={cn(
        'av-slide-content',
        `av-slide-content--valign-${contentLayer.verticalAlign}`,
        `av-slide-content--halign-${contentLayer.horizontalAlign}`,
        compact && 'av-slide-content--compact',
        preview && 'av-slide-content--preview',
        className,
      )}
    >
      <div
        className="av-slide-content__inner"
        style={
          compact || preview
            ? undefined
            : { padding: `${paddingCqw}cqw` }
        }
      >
        {lines.map((line, index) => (
          <div
            key={`${index}-${line.slice(0, 12)}`}
            className={cn(
              'av-slide-content__line',
              `av-slide-content__line--align-${contentLayer.textAlign}`,
              `av-slide-content__line--shadow-${contentLayer.textShadow}`,
              `av-slide-content__line--transform-${contentLayer.textTransform}`,
            )}
            style={
              compact
                ? undefined
                : preview
                  ? { fontSize: `${previewFontPx}px` }
                  : { fontSize: `${fontSizeCqw}cqw` }
            }
          >
            {line || '\u00a0'}
          </div>
        ))}
      </div>
    </div>
  )
}
