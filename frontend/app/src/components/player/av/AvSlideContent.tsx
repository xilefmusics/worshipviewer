import type { CSSProperties } from 'react'

import {
  AV_FONT_FAMILY_CHOICES,
  AV_TEXT_SHADOW_LIGHT_THRESHOLD,
  DEFAULT_AV_PREFERENCES,
  resolveAvTextLightness,
  type AvContentLayer,
} from '@/lib/player/av-preferences'
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
  geometryOverlaySize?: number
  className?: string
  compact?: boolean
  adaptiveWidth?: boolean
}

type AvLineKind = 'primary' | 'secondary'
type AvLineStyle = CSSProperties & { '--av-text-lightness': string }
type AvContentStyle = CSSProperties & { '--av-cross-center-offset': string }

function renderLine(
  line: string,
  contentLayer: AvContentLayer,
  designFontSizePx: number,
  compact: boolean,
  kind: AvLineKind = 'primary',
  className?: string,
) {
  const fallbackLightness =
    DEFAULT_AV_PREFERENCES.contentLayer[
      kind === 'primary' ? 'primaryTextLightness' : 'secondaryTextLightness'
    ]
  const lightness = resolveAvTextLightness(
    contentLayer[
      kind === 'primary' ? 'primaryTextLightness' : 'secondaryTextLightness'
    ],
    fallbackLightness,
  )
  const fontFamily = AV_FONT_FAMILY_CHOICES.find(
    (choice) => choice.value === (contentLayer.fontFamily ?? 'rubik'),
  )?.css ?? AV_FONT_FAMILY_CHOICES[0].css
  const lineStyle: AvLineStyle = {
    '--av-text-lightness': `${lightness}%`,
    fontFamily,
    ...(compact
      ? {}
      : {
          fontSize: `${designFontSizePx}px`,
          lineHeight: `${avSlideLineHeightPx(designFontSizePx)}px`,
        }),
  }

  return (
    <div
      className={cn(
        'av-slide-content__line',
        `av-slide-content__line--align-${contentLayer.textAlign}`,
        `av-slide-content__line--shadow-${contentLayer.textShadow}`,
        `av-slide-content__line--shadow-${lightness <= AV_TEXT_SHADOW_LIGHT_THRESHOLD ? 'white' : 'black'}`,
        `av-slide-content__line--transform-${contentLayer.textTransform}`,
        className,
      )}
      style={lineStyle}
    >
      {line || '\u00a0'}
    </div>
  )
}

export function AvSlideContent({
  text,
  lines,
  contentLayer,
  geometryOverlaySize,
  className,
  compact = false,
  adaptiveWidth = false,
}: AvSlideContentProps) {
  const designFontSizePx = contentLayer.fontSize
  const crossCenterOffset =
    13.3 * ((geometryOverlaySize ?? DEFAULT_AV_PREFERENCES.geometryOverlaySize) / 64)
  const contentStyle: AvContentStyle = {
    '--av-cross-center-offset': `${crossCenterOffset}%`,
    ...(compact ? {} : { padding: `${AV_SLIDE_EDGE_PADDING_PX}px` }),
  }
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
      style={contentStyle}
    >
      <div
        className={cn(
          'av-slide-content__inner',
          adaptiveWidth && !compact && 'av-slide-content__inner--adaptive',
        )}
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
                      'secondary',
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
