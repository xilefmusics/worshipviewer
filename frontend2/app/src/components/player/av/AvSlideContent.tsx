import type { AvContentLayer } from '@/lib/player/av-preferences'
import { cn } from '@/lib/utils'

import './player-av.css'

type AvSlideContentProps = {
  text: string
  contentLayer: AvContentLayer
  className?: string
}

export function AvSlideContent({ text, contentLayer, className }: AvSlideContentProps) {
  const fontSizeCqw = contentLayer.fontSize / 19.2
  const paddingCqw = fontSizeCqw * 2

  return (
    <div
      className={cn(
        'av-slide-content',
        `av-slide-content--valign-${contentLayer.verticalAlign}`,
        `av-slide-content--halign-${contentLayer.horizontalAlign}`,
        className,
      )}
    >
      <div className="av-slide-content__inner" style={{ padding: `${paddingCqw}cqw` }}>
        {text.split('\n').map((line, index) => (
          <div
            key={`${index}-${line.slice(0, 12)}`}
            className={cn(
              'av-slide-content__line',
              `av-slide-content__line--align-${contentLayer.textAlign}`,
              `av-slide-content__line--shadow-${contentLayer.textShadow}`,
              `av-slide-content__line--transform-${contentLayer.textTransform}`,
            )}
            style={{ fontSize: `${fontSizeCqw}cqw` }}
          >
            {line || '\u00a0'}
          </div>
        ))}
      </div>
    </div>
  )
}
