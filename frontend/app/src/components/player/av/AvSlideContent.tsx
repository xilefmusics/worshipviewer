import type { AvContentLayer } from '@/lib/player/av-preferences'
import type { AvLyricLine } from '@/lib/player/av-lyric-slides'
import {
  AV_SLIDE_EDGE_PADDING_PX,
  avSlideInnerPaddingPx,
  avSlideLineHeightPx,
} from '@/lib/player/av-slide-scale'
import { cn } from '@/lib/utils'

import './player-av.css'

type AvSlideContentProps = {
  text?: string
  lines?: AvLyricLine[]
  contentLayer: AvContentLayer
  className?: string
  compact?: boolean
}

function renderLine(
  line: string,
  contentLayer: AvContentLayer,
  designFontSizePx: number,
  compact: boolean,
  className?: string,
) {
  return (
    <div
      className={cn(
        'av-slide-content__line',
        `av-slide-content__line--align-${contentLayer.textAlign}`,
        `av-slide-content__line--shadow-${contentLayer.textShadow}`,
        `av-slide-content__line--transform-${contentLayer.textTransform}`,
        className,
      )}
      style={
        compact
          ? undefined
          : {
              fontSize: `${designFontSizePx}px`,
              lineHeight: `${avSlideLineHeightPx(designFontSizePx)}px`,
            }
      }
    >
      {line || '\u00a0'}
    </div>
  )
}

export function AvSlideContent({
  text,
  lines,
  contentLayer,
  className,
  compact = false,
}: AvSlideContentProps) {
  const designFontSizePx = contentLayer.fontSize
  const structuredLines = lines
    ? compact
      ? lines.slice(0, 1)
      : lines
    : undefined
  const plainLines = structuredLines
    ? undefined
    : compact
      ? [text?.split('\n')[0] ?? '']
      : (text?.split('\n') ?? [''])

  return (
    <div
      className={cn(
        'av-slide-content',
        `av-slide-content--valign-${contentLayer.verticalAlign}`,
        `av-slide-content--halign-${contentLayer.horizontalAlign}`,
        compact && 'av-slide-content--compact',
        className,
      )}
      style={compact ? undefined : { padding: `${AV_SLIDE_EDGE_PADDING_PX}px` }}
    >
      <div
        className="av-slide-content__inner"
        style={
          compact
            ? undefined
            : { padding: `${avSlideInnerPaddingPx(designFontSizePx)}px` }
        }
      >
        {structuredLines
          ? structuredLines.map((line, index) => (
              <div
                key={`${index}-${line.primary.slice(0, 12)}`}
                className="av-slide-content__line-group"
              >
                {renderLine(line.primary, contentLayer, designFontSizePx, compact)}
                {line.secondary
                  ? renderLine(
                      line.secondary,
                      contentLayer,
                      designFontSizePx * 0.75,
                      compact,
                      'av-slide-content__line--secondary',
                    )
                  : null}
              </div>
            ))
          : plainLines?.map((line, index) => (
              <div key={`${index}-${line.slice(0, 12)}`}>
                {renderLine(line, contentLayer, designFontSizePx, compact)}
              </div>
            ))}
      </div>
    </div>
  )
}
