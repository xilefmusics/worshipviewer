import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'
import type { AvGeometryOverlay } from '@/lib/player/av-preferences'

type AvGeometryOverlayShapeProps = {
  overlay: Exclude<AvGeometryOverlay, 'none'>
  opacity?: number
  color?: number
  size?: number
  thickness?: number
  className?: string
}

export function AvGeometryOverlayShape({
  overlay,
  opacity = 77,
  color = 77,
  size = 77,
  thickness = 77,
  className,
}: AvGeometryOverlayShapeProps) {
  const clampedOpacity = Math.max(0, Math.min(100, opacity))
  const clampedColor = Math.max(0, Math.min(100, color))
  const clampedSize = Math.max(0, Math.min(100, size))
  const clampedThickness = Math.max(0, Math.min(100, thickness))
  const sliceWidth = overlay === 'sliced_square'
    ? 27.25 + clampedThickness * 0.2175
    : overlay === 'sliced_rectangle'
      ? 10 + clampedThickness * 0.1363636364
      : null
  return (
    <div
      className={cn(
        'av-geometry-overlay',
        `av-geometry-overlay--${overlay}`,
        className,
      )}
      aria-hidden
      data-testid={`av-geometry-overlay-${overlay}`}
      data-opacity={clampedOpacity}
      data-color={clampedColor}
      data-size={clampedSize}
      data-thickness={clampedThickness}
      style={{
        '--av-geometry-overlay-opacity': clampedOpacity / 100,
        '--av-geometry-overlay-grayscale': clampedOpacity === 0
          ? 0
          : (100 - clampedColor) / 100,
        '--av-geometry-overlay-scale': clampedSize / 70,
        '--av-geometry-overlay-bar-half-thickness': `${2 + clampedThickness * 0.08}%`,
        ...(sliceWidth == null ? {} : { '--av-geometry-overlay-slice-width': `${sliceWidth}%` }),
      } as CSSProperties}
    >
      <div className="av-geometry-overlay__canvas">
        {overlay === 'sliced_rectangle' ? (
          <div
            className="av-geometry-overlay__sliced-rectangle"
            style={{ top: '15%', left: '15%', width: '70%', height: '70%' }}
          >
            <span
              className="av-geometry-overlay__sliced-rectangle-panel av-geometry-overlay__sliced-rectangle-panel--one"
            />
            <span
              className="av-geometry-overlay__sliced-rectangle-panel av-geometry-overlay__sliced-rectangle-panel--two"
            />
            <span
              className="av-geometry-overlay__sliced-rectangle-panel av-geometry-overlay__sliced-rectangle-panel--three"
            />
            <span
              className="av-geometry-overlay__sliced-rectangle-panel av-geometry-overlay__sliced-rectangle-panel--four"
            />
          </div>
        ) : overlay === 'sliced_square' ? (
          <div
            className="av-geometry-overlay__sliced-square"
            style={{
              top: '15%',
              left: '50%',
              width: '70cqh',
              height: '70%',
              transform: 'translateX(-50%)',
              aspectRatio: '1 / 1',
            }}
          >
            <span className="av-geometry-overlay__sliced-square-panel av-geometry-overlay__sliced-square-panel--left" />
            <span className="av-geometry-overlay__sliced-square-panel av-geometry-overlay__sliced-square-panel--right" />
          </div>
        ) : overlay === 'cross' || overlay === 'inverted_cross' ? (
          <div className="av-geometry-overlay__cross" style={{ inset: '15%' }}>
            {overlay === 'cross' ? (
              <span className="av-geometry-overlay__cross-shape" />
            ) : (
              <>
                <span
                  className="av-geometry-overlay__inverted-cross-panel av-geometry-overlay__inverted-cross-panel--top-left"
                />
                <span
                  className="av-geometry-overlay__inverted-cross-panel av-geometry-overlay__inverted-cross-panel--top-right"
                />
                <span
                  className="av-geometry-overlay__inverted-cross-panel av-geometry-overlay__inverted-cross-panel--bottom-left"
                />
                <span
                  className="av-geometry-overlay__inverted-cross-panel av-geometry-overlay__inverted-cross-panel--bottom-right"
                />
              </>
            )}
          </div>
        ) : (
          <span
            className={cn('av-geometry-overlay__shape', `av-geometry-overlay__shape--${overlay}`)}
            style={overlay === 'rectangle'
              ? { top: '15%', left: '15%', width: '70%', height: '70%' }
              : {
                  top: '15%',
                  left: '50%',
                  width: '70cqh',
                  height: '70%',
                  transform: 'translateX(-50%)',
                  aspectRatio: '1 / 1',
                }}
          />
        )}
      </div>
    </div>
  )
}
