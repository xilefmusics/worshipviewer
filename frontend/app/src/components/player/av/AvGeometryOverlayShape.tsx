import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'

import { cn } from '@/lib/utils'
import type { AvGeometryOverlay } from '@/lib/player/av-preferences'

type BackgroundCutout = { key: string; clipPath: string }

type AvGeometryOverlayShapeProps = {
  overlay: Exclude<AvGeometryOverlay, 'none'>
  opacity?: number
  color?: number
  size?: number
  thickness?: number
  rotatedBackground?: boolean
  videoSrc?: string
  backgroundImageSrc?: string
  masterVideoRef?: RefObject<HTMLVideoElement | null>
  className?: string
}

function crossClipPath(): string {
  const x = 'var(--av-geometry-overlay-bar-half-thickness-x, 4.2%)'
  const y = 'var(--av-geometry-overlay-bar-half-thickness-y, 4.2%)'
  const horizontalTop = `calc(36.7% - ${y})`
  const horizontalBottom = `calc(36.7% + ${y})`
  return `polygon(
    calc(50% - ${x}) 15%, calc(50% + ${x}) 15%,
    calc(50% + ${x}) ${horizontalTop}, 69.6% ${horizontalTop},
    69.6% ${horizontalBottom}, calc(50% + ${x}) ${horizontalBottom},
    calc(50% + ${x}) 85%, calc(50% - ${x}) 85%,
    calc(50% - ${x}) ${horizontalBottom}, 30.4% ${horizontalBottom},
    30.4% ${horizontalTop}, calc(50% - ${x}) ${horizontalTop}
  )`
}

function geometryBackgroundCutouts(overlay: Exclude<AvGeometryOverlay, 'none'>, thickness: number): BackgroundCutout[] {
  const crossX = 'var(--av-geometry-overlay-bar-half-thickness-x, 4.2%)'
  const crossY = 'var(--av-geometry-overlay-bar-half-thickness-y, 4.2%)'
  if (overlay === 'cross') return [{ key: 'cross', clipPath: crossClipPath() }]
  if (overlay === 'inverted_cross') {
    return [
      {
        key: 'top-left',
        clipPath: `inset(15% calc(50% - ${crossX}) calc(63.3% + ${crossY}) 30.4%)`,
      },
      {
        key: 'top-right',
        clipPath: `inset(15% 15% calc(63.3% + ${crossY}) calc(50% + ${crossX}))`,
      },
      {
        key: 'bottom-left',
        clipPath: `inset(calc(36.7% + ${crossY}) calc(50% - ${crossX}) 15% 30.4%)`,
      },
      {
        key: 'bottom-right',
        clipPath: `inset(calc(36.7% + ${crossY}) 15% 15% calc(50% + ${crossX}))`,
      },
    ]
  }
  if (overlay === 'sliced_square') {
    return [
      {
        key: 'left',
        clipPath: 'inset(15% calc(50% + 35cqh - var(--av-geometry-overlay-sliced-square-panel-width, 30.8cqh)) 15% calc(50% - 35cqh))',
      },
      {
        key: 'right',
        clipPath: 'inset(15% calc(50% - 35cqh) 15% calc(50% + 35cqh - var(--av-geometry-overlay-sliced-square-panel-width, 30.8cqh)))',
      },
    ]
  }
  if (overlay === 'sliced_rectangle') {
    const panelWidth = (10 + thickness * 0.1363636364) * 0.7
    const gap = (70 - panelWidth * 4) / 3
    return Array.from({ length: 4 }, (_, index) => {
      const left = 15 + index * (panelWidth + gap)
      const right = 100 - left - panelWidth
      return { key: `panel-${index + 1}`, clipPath: `inset(15% ${right}% 15% ${left}%)` }
    })
  }
  if (overlay === 'circle') return [{ key: 'circle', clipPath: 'circle(35cqh at 50% 50%)' }]
  if (overlay === 'square') {
    return [{ key: 'square', clipPath: 'inset(15% calc(50% - 35cqh) 15% calc(50% - 35cqh))' }]
  }
  if (overlay === 'rectangle') return [{ key: 'rectangle', clipPath: 'inset(15% 15%)' }]
  if (overlay === 'triangle') {
    return [{ key: 'triangle', clipPath: 'polygon(50% 15%, calc(50% + 35cqh) 85%, calc(50% - 35cqh) 85%)' }]
  }
  if (overlay === 'inverted_triangle') {
    return [{ key: 'inverted-triangle', clipPath: 'polygon(calc(50% - 35cqh) 15%, calc(50% + 35cqh) 15%, 50% 85%)' }]
  }
  if (overlay === 'diamond') {
    return [{ key: 'diamond', clipPath: 'polygon(50% 15%, calc(50% + 35cqh) 50%, 50% 85%, calc(50% - 35cqh) 50%)' }]
  }

  const heartPoints = [
    [50, 100], [12, 63], [3, 52], [0, 40], [0, 26], [5, 13], [14, 5], [25, 2],
    [36, 4], [44, 11], [50, 21], [56, 11], [64, 4], [75, 2], [86, 5], [95, 13],
    [100, 26], [100, 40], [97, 52], [88, 63],
  ]
  const heartPolygon = heartPoints.map(([x, y]) => {
    const horizontal = x === 50 ? '50%' : `calc(50% ${x < 50 ? '-' : '+'} ${Math.abs(x - 50) * 0.7}cqh)`
    return `${horizontal} ${15 + y * 0.7}%`
  }).join(', ')
  return [{ key: 'heart', clipPath: `polygon(${heartPolygon})` }]
}

function RotatedBackgroundFill({
  src,
  poster,
  masterVideoRef,
  clipPath,
}: {
  src?: string
  poster?: string
  masterVideoRef?: RefObject<HTMLVideoElement | null>
  clipPath: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const master = masterVideoRef?.current
    const video = videoRef.current
    if (!master || !video) return

    const syncPlayback = () => {
      if (
        master.readyState >= HTMLMediaElement.HAVE_METADATA &&
        video.readyState >= HTMLMediaElement.HAVE_METADATA &&
        Math.abs(master.currentTime - video.currentTime) > 0.2
      ) {
        video.currentTime = master.currentTime
      }
      if (master.paused) video.pause()
      else if (video.paused) void video.play().catch(() => undefined)
    }

    master.addEventListener('timeupdate', syncPlayback)
    master.addEventListener('seeking', syncPlayback)
    master.addEventListener('seeked', syncPlayback)
    master.addEventListener('play', syncPlayback)
    master.addEventListener('pause', syncPlayback)
    video.addEventListener('loadedmetadata', syncPlayback)
    syncPlayback()

    return () => {
      master.removeEventListener('timeupdate', syncPlayback)
      master.removeEventListener('seeking', syncPlayback)
      master.removeEventListener('seeked', syncPlayback)
      master.removeEventListener('play', syncPlayback)
      master.removeEventListener('pause', syncPlayback)
      video.removeEventListener('loadedmetadata', syncPlayback)
    }
  }, [masterVideoRef, src])

  return src ? (
    <div className="av-geometry-overlay__background-cutout" style={{ clipPath } as CSSProperties}>
      <video
        ref={videoRef}
        className="av-geometry-overlay__background-fill"
        src={src}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        crossOrigin="use-credentials"
        preload="auto"
        aria-hidden
      />
    </div>
  ) : poster ? (
    <div className="av-geometry-overlay__background-cutout" style={{ clipPath } as CSSProperties}>
      <img
        className="av-geometry-overlay__background-fill"
        src={poster}
        alt=""
        crossOrigin="use-credentials"
      />
    </div>
  ) : null
}

export function AvGeometryOverlayShape({
  overlay,
  opacity = 77,
  color = 77,
  size = 77,
  thickness = 77,
  rotatedBackground = false,
  videoSrc,
  backgroundImageSrc,
  masterVideoRef,
  className,
}: AvGeometryOverlayShapeProps) {
  const clampedOpacity = Math.max(0, Math.min(100, opacity))
  const clampedColor = Math.max(0, Math.min(100, color))
  const clampedSize = Math.max(0, Math.min(100, size))
  const clampedThickness = Math.max(0, Math.min(100, thickness))
  const backgroundCutouts = geometryBackgroundCutouts(overlay, clampedThickness)
  const hasRotatedBackgroundFill = rotatedBackground && Boolean(videoSrc || backgroundImageSrc)
  const rotatedBackgroundStyle = {
    '--av-geometry-overlay-opacity': clampedOpacity / 100,
    '--av-geometry-overlay-scale': clampedSize / 70,
    '--av-geometry-overlay-bar-half-thickness-x': `${(2 + clampedThickness * 0.08) * 0.7}%`,
    '--av-geometry-overlay-bar-half-thickness-y': `${(2 + clampedThickness * 0.08) * 0.7}%`,
    '--av-geometry-overlay-sliced-square-panel-width': `${(27.25 + clampedThickness * 0.2175) * 0.7}cqh`,
  } as CSSProperties

  return (
    <div
      className={cn(
        'av-geometry-overlay',
        `av-geometry-overlay--${overlay}`,
        hasRotatedBackgroundFill && 'av-geometry-overlay--rotated-background',
        className,
      )}
      aria-hidden
      data-testid={`av-geometry-overlay-${overlay}`}
      data-opacity={clampedOpacity}
      data-color={clampedColor}
      data-size={clampedSize}
      data-thickness={clampedThickness}
      data-rotated-background={rotatedBackground}
      style={{
        '--av-geometry-overlay-opacity': clampedOpacity / 100,
        '--av-geometry-overlay-grayscale': clampedOpacity === 0
          ? 0
          : (100 - clampedColor) / 100,
        '--av-geometry-overlay-scale': clampedSize / 70,
        '--av-geometry-overlay-bar-half-thickness': `${2 + clampedThickness * 0.08}%`,
        ...rotatedBackgroundStyle,
      } as CSSProperties}
    >
      <div className="av-geometry-overlay__canvas">
        {hasRotatedBackgroundFill ? backgroundCutouts.map((cutout) => (
          <RotatedBackgroundFill
            key={cutout.key}
            src={videoSrc}
            poster={backgroundImageSrc}
            masterVideoRef={masterVideoRef}
            clipPath={cutout.clipPath}
          />
        )) : overlay === 'sliced_rectangle' ? (
          <div
            className="av-geometry-overlay__sliced-rectangle"
            style={{ top: '15%', left: '15%', width: '70%', height: '70%' }}
          >
            <span className="av-geometry-overlay__sliced-rectangle-panel av-geometry-overlay__sliced-rectangle-panel--one" />
            <span className="av-geometry-overlay__sliced-rectangle-panel av-geometry-overlay__sliced-rectangle-panel--two" />
            <span className="av-geometry-overlay__sliced-rectangle-panel av-geometry-overlay__sliced-rectangle-panel--three" />
            <span className="av-geometry-overlay__sliced-rectangle-panel av-geometry-overlay__sliced-rectangle-panel--four" />
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
                <span className="av-geometry-overlay__inverted-cross-panel av-geometry-overlay__inverted-cross-panel--top-left" />
                <span className="av-geometry-overlay__inverted-cross-panel av-geometry-overlay__inverted-cross-panel--top-right" />
                <span className="av-geometry-overlay__inverted-cross-panel av-geometry-overlay__inverted-cross-panel--bottom-left" />
                <span className="av-geometry-overlay__inverted-cross-panel av-geometry-overlay__inverted-cross-panel--bottom-right" />
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
